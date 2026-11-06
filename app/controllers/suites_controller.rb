class SuitesController < ApplicationController
  before_action :check_maintenance, only: [:create]
  before_action :check_wait, only: [:create]
  before_action :check_queue_size, only: [:create]
  before_action :set_base64_encoded
  before_action :check_requested_fields, only: [:show]
  before_action :check_test_case_requested_fields, only: [:show_test_case]

  def create
    parsed_suite_params = suite_params(params)
    test_cases_input = params[:test_cases].presence || []

    if test_cases_input.empty?
      render json: { error: "there should be at least one test case in a suite" }, status: :bad_request
      return
    elsif test_cases_input.size > Config::MAX_TEST_CASES_PER_SUITE
      render json: {
        error: "number of test cases in a suite should be less than or equal to #{Config::MAX_TEST_CASES_PER_SUITE}"
      }, status: :bad_request
      return
    end

    suite = Suite.new(parsed_suite_params)

    test_cases_input.each do |tc_input|
      stdin = tc_input[:stdin]
      expected_output = tc_input[:expected_output]

      if @base64_encoded
        stdin = Base64Service.decode(stdin)
        expected_output = Base64Service.decode(expected_output)
      end

      suite.suite_test_cases.build(
        stdin: stdin,
        expected_output: expected_output
      )
    end

    if suite.save
      if @wait
        begin
          SuiteRunner.perform_now(suite)
          suite.reload
          fields_service = Fields::Suite.new(params[:fields])
          render json: suite, status: :created, base64_encoded: @base64_encoded, fields: fields_service.requested_fields
        rescue Encoding::UndefinedConversionError
          render json: {
            error: "some attributes for this suite cannot be converted to UTF-8, use base64_encoded=true query parameter",
            suite_token: suite.token
          }, status: :created
        end
      else
        SuiteRunner.perform_later(suite)
        render json: {
          suite_token: suite.token,
          test_cases: suite.suite_test_cases.order(:id).collect { |tc| { token: tc.token } }
        }, status: :created
      end
    else
      render json: suite.errors, status: :unprocessable_entity
    end
  end

  def show
    suite = Suite.find_by!(token: params[:token])
    render json: suite, base64_encoded: @base64_encoded, fields: @requested_fields
  rescue ActiveRecord::RecordNotFound
    render json: { error: "suite with token '#{params[:token]}' not found" }, status: :not_found
  rescue Encoding::UndefinedConversionError
    render json: {
      error: "some attributes for this suite cannot be converted to UTF-8, use base64_encoded=true query parameter"
    }, status: :bad_request
  end

  def show_test_case
    test_case = SuiteTestCase.find_by!(token: params[:test_case_token])
    render json: test_case, serializer: SuiteTestCaseSerializer, base64_encoded: @base64_encoded, fields: @test_case_requested_fields
  rescue ActiveRecord::RecordNotFound
    render json: { error: "test case with token '#{params[:test_case_token]}' not found" }, status: :not_found
  rescue Encoding::UndefinedConversionError
    render json: {
      error: "some attributes for this test case cannot be converted to UTF-8, use base64_encoded=true query parameter"
    }, status: :bad_request
  end

  private

  def suite_params(params)
    permitted = params.permit(
      :source_code,
      :language_id,
      :compiler_options,
      :command_line_arguments,
      :number_of_runs,
      :cpu_time_limit,
      :cpu_extra_time,
      :wall_time_limit,
      :memory_limit,
      :stack_limit,
      :max_processes_and_or_threads,
      :enable_per_process_and_thread_time_limit,
      :enable_per_process_and_thread_memory_limit,
      :max_file_size,
      :redirect_stderr_to_stdout,
      :callback_url,
      :additional_files,
      :enable_network
    )

    permitted[:additional_files] = Base64Service.decode(permitted[:additional_files])

    if @base64_encoded
      permitted[:source_code] = Base64Service.decode(permitted[:source_code])
    end

    permitted
  end

  def check_wait
    @wait = params[:wait] == "true"
    if @wait && !Config::ENABLE_WAIT_RESULT
      render json: { error: "wait not allowed" }, status: :bad_request
    end
  end

  def check_queue_size
    if Resque.size(ENV["JUDGE0_VERSION"]) + 1 > Config::MAX_QUEUE_SIZE
      render json: { error: "queue is full" }, status: :service_unavailable
    end
  end

  def check_requested_fields
    fields_service = Fields::Suite.new(params[:fields])
    if fields_service.has_invalid_fields?
      render json: { error: "invalid fields: [#{fields_service.invalid_fields.join(', ')}]" }, status: :bad_request
      return
    end
    @requested_fields = fields_service.requested_fields
  end

  def check_test_case_requested_fields
    fields_service = Fields::SuiteTestCase.new(params[:fields])
    if fields_service.has_invalid_fields?
      render json: { error: "invalid fields: [#{fields_service.invalid_fields.join(', ')}]" }, status: :bad_request
      return
    end
    @test_case_requested_fields = fields_service.requested_fields
  end

  def set_base64_encoded
    if Config::DISABLE_IMPLICIT_BASE64_ENCODING
      @base64_encoded = params[:base64_encoded] == "true"
    else
      @base64_encoded = params[:base64_encoded] != "false"
    end
  end
end

