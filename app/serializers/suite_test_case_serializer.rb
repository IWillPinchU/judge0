class SuiteTestCaseSerializer < ActiveModel::Serializer
  def self.all_attributes
    [
      :token, :status_id, :status, :stdin, :expected_output, :stdout, :stderr,
      :exit_code, :exit_signal, :message, :time, :wall_time, :memory,
      :compile_output, :created_at, :started_at, :finished_at
    ]
  end

  attributes(*all_attributes)

  def self.default_fields
    @@default_fields ||= [
      :token,
      :status,
      :stdout,
      :stderr,
      :compile_output,
      :message,
      :time,
      :wall_time,
      :memory,
      :exit_code,
      :exit_signal
    ]
  end

  def stdin
    object_decoder(:stdin)
  end

  def stdout
    object_decoder(:stdout)
  end

  def stderr
    object_decoder(:stderr)
  end

  def expected_output
    object_decoder(:expected_output)
  end

  def compile_output
    if instance_options[:base64_encoded] && object.compile_output.present?
      return Base64Service.encode(object.compile_output)
    end
    object.compile_output
  end

  def message
    if instance_options[:base64_encoded] && object.message.present?
      return Base64Service.encode(object.message)
    end
    object.message
  end

  def status
    { id: object.status_id, description: object.status.try(:name) }
  end

  private

  def object_decoder(method)
    instance_options[:base64_encoded] ? object[method] : object.send(method)
  end
end
