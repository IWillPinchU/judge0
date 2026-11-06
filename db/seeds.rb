require_relative 'languages/archived'

if ENV["JUDGE0_LEAN_MODE"] == "true" || ENV["JUDGE0_LANGUAGES"] == "four"
  require_relative 'languages/active_four_languages'
else
  require_relative 'languages/active'
end

ActiveRecord::Base.transaction do
  Language.unscoped.delete_all
  @languages.each_with_index do |language, index|
    Language.create(
      id: language[:id],
      name: language[:name],
      is_archived: language[:is_archived],
      source_file: language[:source_file],
      compile_cmd: language[:compile_cmd],
      run_cmd: language[:run_cmd],
    )
  end
end
