#!/usr/bin/env ruby

require "json"
require "fileutils"
require "net/http"
require "optparse"
require "thread"
require "time"
require "uri"

SCRIPT_DIR = __dir__
WORDS_ROOT = File.expand_path("..", SCRIPT_DIR)
DEFAULT_SOURCE = File.join(WORDS_ROOT, "study_words.html")
DEFAULT_OUTPUT = File.join(WORDS_ROOT, "assets", "audio", "listening-word")
DEFAULT_LOG_DIR = File.join(WORDS_ROOT, "logs")

def sanitize_name(value)
  value.to_s.strip.gsub(/[\\\/:*?"<>|]/, "_").gsub(/\s+/, "_")
end

def file_ready?(path)
  File.file?(path) && File.size?(path)
end

def parse_audio_items(html)
  match = html.match(/window\.LISTENING_WORD_AUDIO_DATA\s*=\s*(\[[\s\S]*?\]);/)
  raise "未找到 LISTENING_WORD_AUDIO_DATA 数据。" unless match

  JSON.parse(match[1])
end

def extract_relative_original(url, chapter_id)
  uri = URI.parse(url)
  path = uri.path.to_s
  marker = "/audio/"
  idx = path.index(marker)

  if idx
    raw_relative = path[(idx + marker.length)..].to_s.sub(%r{^/}, "")
    return File.join("original", raw_relative)
  end

  File.join("original", chapter_id.to_s, File.basename(path))
rescue StandardError
  File.join("original", chapter_id.to_s, "unknown.mp3")
end

def normalize_url_candidates(url)
  candidates = [url.to_s.strip]

  begin
    uri = URI.parse(candidates.first)
    if uri.path&.include?(" ")
      alt = uri.dup
      alt.path = uri.path.gsub(" ", "%20")
      candidates << alt.to_s
    end
  rescue StandardError
    # Ignore invalid URL expansion and keep the original value.
  end

  candidates.reject(&:empty?).uniq
end

def fetch_to_file(url_string, target_path, timeout_seconds, redirect_limit = 5)
  raise "重定向次数过多" if redirect_limit <= 0

  uri = URI.parse(url_string)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == "https"
  http.open_timeout = timeout_seconds
  http.read_timeout = timeout_seconds

  request = Net::HTTP::Get.new(uri.request_uri)

  http.request(request) do |response|
    case response
    when Net::HTTPSuccess
      FileUtils.mkdir_p(File.dirname(target_path))
      temp_path = "#{target_path}.part"
      File.open(temp_path, "wb") do |file|
        response.read_body { |chunk| file.write(chunk) }
      end
      File.rename(temp_path, target_path)
    when Net::HTTPRedirection
      location = response["location"]
      raise "缺少重定向地址" if location.to_s.empty?

      redirected_url = URI.join(url_string, location).to_s
      fetch_to_file(redirected_url, target_path, timeout_seconds, redirect_limit - 1)
    else
      raise "HTTP #{response.code}"
    end
  end
rescue StandardError
  FileUtils.rm_f("#{target_path}.part")
  raise
end

def parse_options
  options = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    chapter: nil,
    concurrency: 8,
    retry: 3,
    timeout: 20,
    limit: 0,
    force: false,
    dry_run: false
  }

  OptionParser.new do |opts|
    opts.banner = "用法: ruby words/scripts/download_study_words_audio_dual.rb [options]"

    opts.on("--source PATH", "study_words.html 路径") { |v| options[:source] = File.expand_path(v) }
    opts.on("--output PATH", "下载目录，默认 words/assets/audio/listening-word") { |v| options[:output] = File.expand_path(v) }
    opts.on("--chapter ID", "仅处理指定 chapterId") { |v| options[:chapter] = v.to_s.strip }
    opts.on("--concurrency N", Integer, "并发下载数，默认 8") { |v| options[:concurrency] = [v, 1].max }
    opts.on("--retry N", Integer, "失败重试次数，默认 3") { |v| options[:retry] = [v, 1].max }
    opts.on("--timeout N", Integer, "单文件超时秒数，默认 20") { |v| options[:timeout] = [v, 1].max }
    opts.on("--limit N", Integer, "仅处理前 N 条，默认 0(不限制)") { |v| options[:limit] = [v, 0].max }
    opts.on("--force", "覆盖已存在文件") { options[:force] = true }
    opts.on("--dry-run", "只输出任务计划，不执行下载") { options[:dry_run] = true }
    opts.on("-h", "--help", "显示帮助") do
      puts opts
      exit 0
    end
  end.parse!

  options
end

def build_tasks(items, options)
  selected = items
  if options[:chapter] && !options[:chapter].empty?
    selected = selected.select { |item| item["chapterId"].to_s == options[:chapter] }
    raise "章节 #{options[:chapter]} 不存在" if selected.empty?
  end

  selected = selected.first(options[:limit]) if options[:limit] > 0

  used_word_names = Hash.new(0)
  tasks = []

  selected.each do |item|
    word = item["word"].to_s.strip
    url = item["mp3Path"].to_s.strip
    chapter_id = item["chapterId"].to_s.strip
    chapter_title = item["chapterTitle"].to_s
    next if word.empty? || url.empty? || chapter_id.empty?

    original_relative = extract_relative_original(url, chapter_id)

    base_word_name = sanitize_name(word)
    base_word_name = "word" if base_word_name.empty?
    used_word_names[[chapter_id, base_word_name]] += 1
    suffix_index = used_word_names[[chapter_id, base_word_name]]
    final_word_name = suffix_index > 1 ? "#{base_word_name}-#{suffix_index}" : base_word_name
    word_relative = File.join("by-word", chapter_id, "#{final_word_name}.mp3")

    tasks << {
      chapter_id: chapter_id,
      chapter_title: chapter_title,
      word: word,
      url: url,
      url_candidates: normalize_url_candidates(url),
      original_relative_path: original_relative,
      word_relative_path: word_relative,
      original_output_path: File.join(options[:output], original_relative),
      word_output_path: File.join(options[:output], word_relative)
    }
  end

  tasks
end

def copy_word_named_file(task)
  FileUtils.mkdir_p(File.dirname(task[:word_output_path]))
  FileUtils.cp(task[:original_output_path], task[:word_output_path])
end

def download_with_retry(task, options)
  error = nil

  task[:url_candidates].each do |url_candidate|
    1.upto(options[:retry]) do |attempt|
      begin
        fetch_to_file(url_candidate, task[:original_output_path], options[:timeout])
        return [true, attempt, nil, url_candidate]
      rescue StandardError => raised_error
        error = raised_error
      end
    end
  end

  [false, options[:retry], error || RuntimeError.new("unknown error"), nil]
end

def write_manifest(tasks, output)
  data = {
    generatedAt: Time.now.iso8601,
    total: tasks.length,
    files: tasks.map do |task|
      {
        chapterId: task[:chapter_id],
        chapterTitle: task[:chapter_title],
        word: task[:word],
        url: task[:url],
        usedUrl: task[:used_url],
        originalFile: task[:original_relative_path],
        wordFile: task[:word_relative_path]
      }
    end
  }

  FileUtils.mkdir_p(output)
  File.write(File.join(output, "manifest.json"), JSON.pretty_generate(data))
end

def write_failed_log(failed_rows)
  return if failed_rows.empty?

  FileUtils.mkdir_p(DEFAULT_LOG_DIR)
  file_name = "download_study_words_audio_failed_#{Time.now.strftime('%Y%m%d_%H%M%S')}.jsonl"
  path = File.join(DEFAULT_LOG_DIR, file_name)

  File.open(path, "w") do |file|
    failed_rows.each { |row| file.puts(JSON.generate(row)) }
  end

  path
end

options = parse_options
html = File.read(options[:source])
items = parse_audio_items(html)
tasks = build_tasks(items, options)

puts "来源: #{options[:source]}"
puts "输出目录: #{options[:output]}"
puts "计划处理: #{tasks.length} 条记录"
puts "并发数: #{options[:concurrency]}，重试次数: #{options[:retry]}"

if tasks.empty?
  puts "没有可处理记录。"
  exit 0
end

if options[:dry_run]
  puts "dry-run 模式，不执行下载。"
  exit 0
end

write_manifest(tasks, options[:output])

downloaded = 0
synced = 0
skipped = 0
failed = 0
failed_rows = []
mutex = Mutex.new
queue = Queue.new
tasks.each_with_index { |task, index| queue << [task, index] }
started_at = Time.now

workers = Array.new([options[:concurrency], tasks.length].min) do
  Thread.new do
    loop do
      task, index = queue.pop(true)
      prefix = "[#{index + 1}/#{tasks.length}] #{task[:chapter_id]} #{task[:word]}"

      original_exists = file_ready?(task[:original_output_path])
      word_exists = file_ready?(task[:word_output_path])

      if !options[:force] && original_exists
        if word_exists
          mutex.synchronize do
            skipped += 1
            puts "#{prefix} -> 两份已存在，跳过"
          end
          next
        end

        begin
          copy_word_named_file(task)
          mutex.synchronize do
            synced += 1
            puts "#{prefix} -> 已补齐单词命名文件"
          end
          next
        rescue StandardError => error
          mutex.synchronize do
            failed += 1
            failed_rows << { chapterId: task[:chapter_id], word: task[:word], url: task[:url], error: "copy_failed: #{error.message}" }
            warn "#{prefix} -> 补齐失败: #{error.message}"
          end
          next
        end
      end

      ok, attempts, error, used_url = download_with_retry(task, options)
      task[:used_url] = used_url if used_url

      if ok
        begin
          copy_word_named_file(task)
          mutex.synchronize do
            downloaded += 1
            puts "#{prefix} -> 下载成功并生成两份 (尝试 #{attempts} 次)"
          end
        rescue StandardError => error
          mutex.synchronize do
            failed += 1
            failed_rows << { chapterId: task[:chapter_id], word: task[:word], url: task[:url], error: "copy_failed: #{error.message}" }
            warn "#{prefix} -> 下载成功但复制失败: #{error.message}"
          end
        end
      else
        mutex.synchronize do
          failed += 1
          failed_rows << { chapterId: task[:chapter_id], word: task[:word], url: task[:url], error: error.message }
          warn "#{prefix} -> 下载失败: #{error.message}"
        end
      end
    rescue ThreadError
      break
    end
  end
end

workers.each(&:join)
write_manifest(tasks, options[:output])

duration = (Time.now - started_at).round(1)
failed_log = write_failed_log(failed_rows)
puts "完成: 下载 #{downloaded}，补齐 #{synced}，跳过 #{skipped}，失败 #{failed}，耗时 #{duration}s"
puts "失败日志: #{failed_log}" if failed_log

exit(1) if failed.positive?
