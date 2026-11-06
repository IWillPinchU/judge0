class AddIndexToCreatedAtOnTables < ActiveRecord::Migration[5.0]
  def change
    add_index :submissions, :created_at unless index_exists?(:submissions, :created_at)
    add_index :suites, :created_at unless index_exists?(:suites, :created_at)
    add_index :suite_test_cases, :created_at unless index_exists?(:suite_test_cases, :created_at)
  end
end

