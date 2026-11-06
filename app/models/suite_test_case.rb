class SuiteTestCase < ApplicationRecord
  belongs_to :suite

  before_create :generate_token
  before_validation :set_defaults

  enumeration :status

  def stdin
    @decoded_stdin ||= Base64Service.decode(self[:stdin])
  end

  def stdin=(value)
    super(value)
    self[:stdin] = Base64Service.encode(self[:stdin])
  end

  def stdout
    @decoded_stdout ||= Base64Service.decode(self[:stdout])
  end

  def stdout=(value)
    super(value)
    self[:stdout] = Base64Service.encode(self[:stdout])
  end

  def expected_output
    @decoded_expected_output ||= Base64Service.decode(self[:expected_output])
  end

  def expected_output=(value)
    super(value)
    self[:expected_output] = Base64Service.encode(self[:expected_output])
  end

  def stderr
    @decoded_stderr ||= Base64Service.decode(self[:stderr])
  end

  def stderr=(value)
    super(value)
    self[:stderr] = Base64Service.encode(self[:stderr])
  end

  def compile_output
    suite.try(:compile_output)
  end

  def status
    Status.find_by(id: status_id)
  end

  def status=(status)
    self.status_id = status.id
  end

  private

  def generate_token
    begin
      self.token = SecureRandom.uuid
    end while self.class.exists?(token: token)
  end

  def set_defaults
    self.status ||= Status.queue
  end
end

