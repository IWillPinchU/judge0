class HealthController < ApplicationController
  def workers
    Resque.workers.first.try(:prune_dead_workers) if params[:prune_dead_workers] == "true"

    queues = Hash.new { |h, k| h[k] = [] }
    Resque.workers.each do |worker|
      worker.queues.each do |queue|
        queues[queue] << worker
      end
    end

    json = []
    Resque.queues.each do |queue|
      workers = queues[queue]
      json << {
        queue: queue,
        size: Resque.size(queue),
        available: workers.count,
        idle: workers.count { |w| w.idle? },
        working: workers.count { |w| w.working? },
        paused: workers.count { |w| w.paused? }
      }
    end

    render json: json
  end

  def healthz
    db_ok = ActiveRecord::Base.connection.active? rescue false
    redis_ok = (Resque.redis.ping == "PONG") rescue false
    workers_count = Resque.workers.size rescue 0

    all_ok = db_ok && redis_ok && workers_count > 0

    render json: {
      status: all_ok ? "ok" : "degraded",
      database: db_ok ? "connected" : "disconnected",
      redis: redis_ok ? "connected" : "disconnected",
      workers: workers_count
    }, status: all_ok ? :ok : :service_unavailable
  end
end
