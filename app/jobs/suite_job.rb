class SuiteJob < ApplicationJob
  retry_on RuntimeError, wait: 0.1.seconds, attempts: 100

  queue_as ENV["JUDGE0_VERSION"].to_sym

  STDIN_FILE_NAME = "stdin.txt"
  STDOUT_FILE_NAME = "stdout.txt"
  STDERR_FILE_NAME = "stderr.txt"
  METADATA_FILE_NAME = "metadata.txt"
  ADDITIONAL_FILES_ARCHIVE_FILE_NAME = "additional_files.zip"

  attr_reader :suite, :cgroups,
              :box_id, :workdir, :boxdir, :tmpdir,
              :source_file, :stdin_file, :stdout_file,
              :stderr_file, :metadata_file, :additional_files_archive_file

  def perform(suite_id)
    @suite = Suite.find(suite_id)
    suite.update(status: Status.process, started_at: DateTime.now, execution_host: ENV["HOSTNAME"])

    initialize_workdir

    if compile == :failure
      cleanup
      return
    end

    execute_test_cases
    cleanup
  rescue Exception => e
    raise e.message unless suite
    suite.update(compile_output: e.message, status: Status.boxerr, finished_at: DateTime.now)
    cleanup(raise_exception = false)
  end

  private

  def initialize_workdir
    @box_id = suite.id % 2147483647
    @cgroups = (!suite.enable_per_process_and_thread_time_limit || !suite.enable_per_process_and_thread_memory_limit) ? "--cg" : ""
    @workdir = `isolate #{cgroups} -b #{box_id} --init`.chomp
    @boxdir = workdir + "/box"
    @tmpdir = workdir + "/tmp"
    @source_file = boxdir + "/" + suite.language.source_file.to_s
    @stdin_file = workdir + "/" + STDIN_FILE_NAME
    @stdout_file = workdir + "/" + STDOUT_FILE_NAME
    @stderr_file = workdir + "/" + STDERR_FILE_NAME
    @metadata_file = workdir + "/" + METADATA_FILE_NAME
    @additional_files_archive_file = boxdir + "/" + ADDITIONAL_FILES_ARCHIVE_FILE_NAME

    [stdin_file, stdout_file, stderr_file, metadata_file].each do |f|
      initialize_file(f)
    end

    File.open(source_file, "wb") { |f| f.write(suite.source_code) } unless suite.is_project

    extract_archive
  end

  def initialize_file(file)
    `sudo touch #{file} && sudo chown $(whoami): #{file}`
  end

  def extract_archive
    return unless suite.additional_files?

    File.open(additional_files_archive_file, "wb") { |f| f.write(suite.additional_files) }

    command = "isolate #{cgroups} \
    -s \
    -b #{box_id} \
    --stderr-to-stdout \
    -t 2 \
    -x 1 \
    -w 4 \
    -k #{Config::MAX_STACK_LIMIT} \
    -p#{Config::MAX_MAX_PROCESSES_AND_OR_THREADS} \
    --open-files=#{Config::MAX_MAX_OPEN_FILES} \
    #{suite.enable_per_process_and_thread_memory_limit ? "-m " : "--cg-mem="}#{Config::MAX_MEMORY_LIMIT} \
    -f #{Config::MAX_EXTRACT_SIZE} \
    --run \
    -- /usr/bin/unzip -n -qq #{ADDITIONAL_FILES_ARCHIVE_FILE_NAME} \
    "

    `#{command}`
    File.delete(additional_files_archive_file) if File.exist?(additional_files_archive_file)
  end

  def compile
    compile_cmd_str = nil
    if suite.language.compile_cmd.present?
      compiler_options = suite.compiler_options.to_s.strip.encode("UTF-8", invalid: :replace).gsub(/[$&;<>|`]/, "")
      compile_cmd_str = (suite.language.compile_cmd % compiler_options)
    elsif suite.language.id == 71 || suite.language.name =~ /Python/i || suite.language.compile_cmd.nil?
      compile_cmd_str = "/usr/bin/python3 -m py_compile #{suite.language.source_file}"
    end

    return :success unless compile_cmd_str.present?

    compile_script = boxdir + "/compile.sh"
    File.open(compile_script, "w") { |f| f.write(compile_cmd_str) }

    compile_output_file = workdir + "/compile_output.txt"
    initialize_file(compile_output_file)

    command = "isolate #{cgroups} \
    -s \
    -b #{box_id} \
    -M #{metadata_file} \
    --stderr-to-stdout \
    -i /dev/null \
    -t #{Config::MAX_CPU_TIME_LIMIT} \
    -x 0 \
    -w #{Config::MAX_WALL_TIME_LIMIT} \
    -k #{Config::MAX_STACK_LIMIT} \
    -p#{Config::MAX_MAX_PROCESSES_AND_OR_THREADS} \
    --open-files=#{Config::MAX_MAX_OPEN_FILES} \
    #{suite.enable_per_process_and_thread_memory_limit ? "-m " : "--cg-mem="}#{Config::MAX_MEMORY_LIMIT} \
    -f #{Config::MAX_MAX_FILE_SIZE} \
    -E HOME=/tmp \
    -E PATH=\"/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\" \
    -E LANG -E LANGUAGE -E LC_ALL -E JUDGE0_HOMEPAGE -E JUDGE0_SOURCE_CODE -E JUDGE0_MAINTAINER -E JUDGE0_VERSION \
    -d /etc:noexec \
    --run \
    -- /bin/bash $(basename #{compile_script}) > #{compile_output_file} \
    "

    puts "[#{DateTime.now}] Compiling suite #{suite.token} (#{suite.id}):"
    puts command.gsub(/\s+/, " ")

    `#{command}`
    process_status = $?

    compile_output = File.read(compile_output_file)
    compile_output = nil if compile_output.empty?
    suite.compile_output = compile_output

    metadata = get_metadata
    reset_metadata_file

    files_to_remove = [compile_output_file, compile_script]
    files_to_remove.each do |f|
      `sudo rm -rf #{f}`
    end

    if process_status.success?
      suite.update(status: Status.process)
      send_webhook({
        type: "suite",
        token: suite.token,
        status: { id: Status.process.id, description: Status.process.name },
        message: "Compilation successful",
        compile_output: ""
      })
      return :success
    end

    if metadata[:status] == "TO"
      suite.compile_output = "Compilation time limit exceeded."
    end

    suite.finished_at = DateTime.now
    suite.status = Status.ce
    suite.save

    suite.suite_test_cases.update_all(status_id: Status.ce.id)

    send_webhook({
      type: "suite",
      token: suite.token,
      status: { id: Status.ce.id, description: Status.ce.name },
      compile_output: suite.compile_output,
      created_at: suite.created_at,
      finished_at: suite.finished_at
    })

    return :failure
  end

  def execute_test_cases
    reset_cgroup
    run_script = boxdir + "/run.sh"
    command_line_arguments = suite.command_line_arguments.to_s.strip.encode("UTF-8", invalid: :replace).gsub(/[$&;<>|`]/, "")
    File.open(run_script, "w") { |f| f.write("#{suite.language.run_cmd} #{command_line_arguments}") }

    command = "isolate #{cgroups} \
    -s \
    -b #{box_id} \
    -M #{metadata_file} \
    #{suite.redirect_stderr_to_stdout ? "--stderr-to-stdout" : ""} \
    #{suite.enable_network ? "--share-net" : ""} \
    -t #{suite.cpu_time_limit} \
    -x #{suite.cpu_extra_time} \
    -w #{suite.wall_time_limit} \
    -k #{suite.stack_limit} \
    -p#{suite.max_processes_and_or_threads} \
    --open-files=#{Config::MAX_OPEN_FILES} \
    #{suite.enable_per_process_and_thread_memory_limit ? "-m " : "--cg-mem="}#{suite.memory_limit} \
    -f #{suite.max_file_size} \
    -E HOME=/tmp \
    -E PATH=\"/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\" \
    -E LANG -E LANGUAGE -E LC_ALL -E JUDGE0_HOMEPAGE -E JUDGE0_SOURCE_CODE -E JUDGE0_MAINTAINER -E JUDGE0_VERSION \
    -d /etc:noexec \
    --run \
    -- /bin/bash $(basename #{run_script}) \
    < #{stdin_file} > #{stdout_file} 2> #{stderr_file} \
    "

    suite.suite_test_cases.order(:id).each do |test_case|
      test_case.update(started_at: DateTime.now)

      File.open(stdin_file, "wb") { |f| f.write(test_case.stdin) }
      initialize_file(stdout_file)
      initialize_file(stderr_file)
      reset_metadata_file

      `#{command}`

      test_case.finished_at = DateTime.now
      metadata = get_metadata

      program_stdout = File.read(stdout_file)
      program_stdout = nil if program_stdout.empty?

      program_stderr = File.read(stderr_file)
      program_stderr = nil if program_stderr.empty?

      test_case.time = metadata[:time].presence || "0.0"
      test_case.wall_time = metadata[:"time-wall"].presence || "0.0"
      test_case.memory = if cgroups.present? && metadata[:"cg-mem"].present? && metadata[:"cg-mem"].to_i > 0
                           metadata[:"cg-mem"].to_i
                         else
                           metadata[:"max-rss"].to_i
                         end
      test_case.stdout = program_stdout
      test_case.stderr = program_stderr
      test_case.exit_code = metadata[:exitcode].try(:to_i) || 0
      test_case.exit_signal = metadata[:exitsig].try(:to_i)
      test_case.message = metadata[:message]
      test_case.status = determine_status(metadata[:status], test_case.exit_signal, test_case.expected_output, test_case.stdout)

      if test_case.status == Status.boxerr &&
         (
           test_case.message.to_s.match(/^execve\(.+\): Exec format error$/) ||
           test_case.message.to_s.match(/^execve\(.+\): No such file or directory$/) ||
           test_case.message.to_s.match(/^execve\(.+\): Permission denied$/)
         )
        test_case.status = Status.exeerr
      end

      test_case.save
      reset_cgroup

      send_webhook({
        type: "test_case",
        token: test_case.token,
        suite_token: suite.token,
        status: { id: test_case.status_id, description: test_case.status.try(:name) },
        stdout: test_case.stdout,
        stderr: test_case.stderr,
        compile_output: nil,
        message: test_case.message,
        exit_code: test_case.exit_code,
        exit_signal: test_case.exit_signal,
        time: test_case.time,
        wall_time: test_case.wall_time,
        memory: test_case.memory
      })
    end

    `sudo rm -f #{run_script}`

    first_non_ac = suite.suite_test_cases.where.not(status_id: Status.ac.id).first
    suite.status = first_non_ac ? first_non_ac.status : Status.ac
    suite.finished_at = DateTime.now
    suite.save

    send_webhook({
      type: "suite",
      token: suite.token,
      status: { id: suite.status_id, description: suite.status.try(:name) },
      created_at: suite.created_at,
      finished_at: suite.finished_at
    })
  end

  def cleanup(raise_exception = true)
    return unless boxdir && workdir && Dir.exist?(workdir)

    fix_permissions
    `sudo rm -rf #{boxdir}/* #{tmpdir}/*`
    [stdin_file, stdout_file, stderr_file, metadata_file].compact.each do |f|
      `sudo rm -rf #{f}`
    end
    `isolate #{cgroups} -b #{box_id} --cleanup` if box_id
    raise "Cleanup of sandbox #{box_id} failed." if raise_exception && Dir.exist?(workdir)
  end

  def reset_metadata_file
    `sudo rm -rf #{metadata_file}`
    initialize_file(metadata_file)
  end

  def fix_permissions
    `sudo chown -R $(whoami): #{boxdir}`
  end

  def reset_cgroup
    return unless cgroups.present? && box_id
    cg_root = (File.read("/run/isolate/cgroup").strip rescue "/sys/fs/cgroup/isolate.slice")
    box_cg = "#{cg_root}/box-#{box_id}"
    if Dir.exist?(box_cg)
      `rmdir #{box_cg} 2>/dev/null && mkdir #{box_cg} 2>/dev/null`
    end
  end

  def send_webhook(payload)
    return unless suite.callback_url.present?

    Config::CALLBACKS_MAX_TRIES.times do
      begin
        response = HTTParty.put(
          suite.callback_url,
          body: payload.to_json,
          headers: {
            "Content-Type" => "application/json"
          },
          timeout: Config::CALLBACKS_TIMEOUT
        )
        break
      rescue Exception => e
      end
    end
  rescue Exception => e
  end

  def get_metadata
    metadata = File.read(metadata_file).split("\n").collect do |e|
      { e.split(":").first.to_sym => e.split(":")[1..-1].join(":") }
    end.reduce({}, :merge)
    metadata || {}
  rescue Exception
    {}
  end

  def determine_status(status, exit_signal, expected_output, stdout)
    if status == "TO"
      Status.tle
    elsif status == "SG"
      Status.find_runtime_error_by_status_code(exit_signal)
    elsif status == "RE"
      Status.nzec
    elsif status == "XX"
      Status.boxerr
    elsif expected_output.nil? || strip(expected_output) == strip(stdout)
      Status.ac
    else
      Status.wa
    end
  end

  def strip(text)
    return nil unless text
    text.split("\n").collect(&:rstrip).join("\n").rstrip
  rescue ArgumentError
    text
  end
end

