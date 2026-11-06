class CreateSuitesAndSuiteTestCases < ActiveRecord::Migration[5.0]
  def change
    create_table :suites, id: :serial do |t|
      t.string   :token, null: false
      t.text     :source_code
      t.integer  :language_id
      t.integer  :status_id
      t.text     :compile_output
      t.string   :callback_url
      t.decimal  :cpu_time_limit
      t.decimal  :cpu_extra_time
      t.decimal  :wall_time_limit
      t.integer  :memory_limit
      t.integer  :stack_limit
      t.integer  :max_processes_and_or_threads
      t.integer  :max_file_size
      t.boolean  :enable_per_process_and_thread_time_limit
      t.boolean  :enable_per_process_and_thread_memory_limit
      t.string   :compiler_options
      t.string   :command_line_arguments
      t.boolean  :redirect_stderr_to_stdout
      t.boolean  :enable_network
      t.binary   :additional_files
      t.integer  :number_of_runs
      t.datetime :created_at
      t.datetime :started_at
      t.datetime :finished_at
      t.datetime :queued_at
      t.string   :queue_host
      t.string   :execution_host

      t.index [:token], name: "index_suites_on_token", unique: true
    end

    create_table :suite_test_cases, id: :serial do |t|
      t.integer  :suite_id, null: false
      t.string   :token, null: false
      t.text     :stdin
      t.text     :expected_output
      t.text     :stdout
      t.text     :stderr
      t.integer  :exit_code
      t.integer  :exit_signal
      t.text     :message
      t.integer  :status_id
      t.decimal  :time
      t.decimal  :wall_time
      t.integer  :memory
      t.datetime :created_at
      t.datetime :started_at
      t.datetime :finished_at

      t.index [:suite_id], name: "index_suite_test_cases_on_suite_id"
      t.index [:token], name: "index_suite_test_cases_on_token", unique: true
    end
  end
end

