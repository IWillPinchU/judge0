require "fileutils"

module SandboxExecutable
  extend ActiveSupport::Concern

  STDIN_FILE_NAME = "stdin.txt"
  STDOUT_FILE_NAME = "stdout.txt"
  STDERR_FILE_NAME = "stderr.txt"
  METADATA_FILE_NAME = "metadata.txt"
  ADDITIONAL_FILES_ARCHIVE_FILE_NAME = "additional_files.zip"

  def initialize_file(file)
    FileUtils.touch(file)
    File.chmod(0666, file)
  end

  def reset_metadata_file
    FileUtils.rm_f(metadata_file)
    initialize_file(metadata_file)
  end

  def fix_permissions
    FileUtils.chmod_R(0777, [boxdir, tmpdir].compact) rescue nil
  end

  def cleanup(raise_exception = true)
    return unless try(:boxdir).present? && try(:workdir).present? && Dir.exist?(workdir)

    fix_permissions
    FileUtils.rm_rf(Dir.glob("#{boxdir}/*"))
    FileUtils.rm_rf(Dir.glob("#{tmpdir}/*")) if try(:tmpdir).present?
    FileUtils.rm_rf([stdin_file, stdout_file, stderr_file, metadata_file].compact)
    `isolate #{cgroups} -b #{box_id} --cleanup` if try(:box_id).present?
    raise "Cleanup of sandbox #{box_id} failed." if raise_exception && Dir.exist?(workdir)
  end

  def get_metadata
    metadata = File.read(metadata_file).split("\n").collect do |e|
      { e.split(":").first.to_sym => e.split(":")[1..-1].join(":") }
    end.reduce({}, :merge)
    metadata || {}
  rescue Exception
    {}
  end

  def strip(text)
    return nil unless text
    text.split("\n").collect(&:rstrip).join("\n").rstrip
  rescue ArgumentError
    text
  end

  def determine_status(status, exit_signal, expected = nil, actual = nil)
    expected ||= try(:submission).try(:expected_output)
    actual   ||= try(:submission).try(:stdout)

    if status == "TO"
      Status.tle
    elsif status == "SG"
      Status.find_runtime_error_by_status_code(exit_signal)
    elsif status == "RE"
      Status.nzec
    elsif status == "XX"
      Status.boxerr
    elsif expected.nil? || strip(expected) == strip(actual)
      Status.ac
    else
      Status.wa
    end
  end
end

