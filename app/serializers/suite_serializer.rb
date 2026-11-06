class SuiteSerializer < ActiveModel::Serializer
  def self.all_attributes
    [
      :token, :status_id, :status, :language_id, :language, :source_code,
      :compile_output, :callback_url, :cpu_time_limit, :cpu_extra_time,
      :wall_time_limit, :memory_limit, :stack_limit, :max_processes_and_or_threads,
      :max_file_size, :enable_per_process_and_thread_time_limit,
      :enable_per_process_and_thread_memory_limit, :compiler_options,
      :command_line_arguments, :redirect_stderr_to_stdout, :enable_network,
      :additional_files, :number_of_runs, :created_at, :started_at, :finished_at,
      :queued_at, :queue_host, :execution_host, :test_cases
    ]
  end

  attributes(*all_attributes)

  def self.default_fields
    @@default_fields ||= [
      :token,
      :status,
      :compile_output,
      :language,
      :test_cases
    ]
  end

  def include_test_cases?
    object.status_id != 6
  end

  def test_cases
    return nil if object.status_id == 6

    object.suite_test_cases.collect do |tc|
      SuiteTestCaseSerializer.new(
        tc,
        {
          base64_encoded: instance_options[:base64_encoded],
          fields: SuiteTestCaseSerializer.default_fields
        }
      ).as_json
    end
  end

  def source_code
    object_decoder(:source_code)
  end

  def compile_output
    object_decoder(:compile_output)
  end

  def status
    { id: object.status_id, description: object.status.try(:name) }
  end

  def language
    ActiveModelSerializers::SerializableResource.new(
      object.language,
      { serializer: LanguageSerializer, fields: [:id, :name] }
    )
  end

  def additional_files
    Base64Service.encode(object.additional_files)
  end

  private

  def object_decoder(method)
    instance_options[:base64_encoded] ? object[method] : object.send(method)
  end
end
