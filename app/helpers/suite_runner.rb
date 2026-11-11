module SuiteRunner
  MAX_WAIT_TIME_S = 600

  INITIAL_WAIT_TIME_S = 0.1
  NEXT_WAIT_TIME_S = 0.1
  WAIT_TIME_FACTOR_S = 0.1
  MAX_SLEEP_S = 0.5

  WAITING_STATUSES = [Status.queue.id, Status.process.id, nil]

  def self.perform_now(suite)
    SuiteRunner.perform_later(suite)

    suite_id = suite.id

    total_wait_time = 0
    (0..).each do |i|
      break if total_wait_time >= MAX_WAIT_TIME_S

      if i == 0
        wait_time = INITIAL_WAIT_TIME_S
      elsif i == 1
        wait_time = NEXT_WAIT_TIME_S
      else
        wait_time = [WAIT_TIME_FACTOR_S * i, MAX_SLEEP_S].min
      end

      sleep(wait_time)

      total_wait_time += wait_time

      current_status_id = Suite.uncached { Suite.where(id: suite_id).pluck(:status_id).first }
      break unless WAITING_STATUSES.include?(current_status_id)
    end
  end

  def self.perform_later(suite)
    suite.update(status: Status.queue, queued_at: DateTime.now, queue_host: ENV["HOSTNAME"])
    target_queue = suite.suite_test_cases.size <= Config::FAST_QUEUE_THRESHOLD ? :fast : :default
    SuiteJob.set(queue: target_queue).perform_later(suite.id)
  end
end

