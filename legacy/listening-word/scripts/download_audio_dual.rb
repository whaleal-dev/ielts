#!/usr/bin/env ruby

require "json"
require "fileutils"
require "net/http"
require "uri"
require "optparse"
require "thread"
require "time"

SCRIPT_DIR = __dir__
PROJECT_ROOT = File.expand_path("..", SCRIPT_DIR)
DEFAULT_MANIFEST = File.join(PROJECT_ROOT, "assets", "audio", "manifest.json")
DEFAULT_OUTPUT = File.join(PROJECT_ROOT, "assets", "audio")
DEFAULT_LOG_DIR = File.join(PROJECT_ROOT, "logs")

def normalize_word_file_name(word)
  word.to_s.strip.gsub(/[\\\/:*?"<>|]/, "_").gsub(/\s+/, "_")
end

def file_ready?(path)
  File.file?(path) && File.size?(path)
end

def normalize_audio_url(url)
  uri = URI.parse(url)
  return url unless uri.path

  normalized_path = uri.path.gsub("+", "%20")
  return url if normalized_path == uri.path

  uri.path = normalized_path
  uri.to_s
rescue StandardError
  url
end

def build_url_candidates(url)
  normalized = normalize_audio_url(url)
  candidates = [normalized]

  begin
    uri = URI.parse(normalized)
    if uri.path&.include?("%20")
      alt = uri.dup
      alt.path = uri.path.gsub("%20", "+")
      candidates << alt.to_s
    end
  rescue StandardError
    # Ignore candidate expansion when URL parsing fails.
  end

  candidates.uniq
end

def encode_url_component(value)
  URI.encode_www_form_component(value.to_s).gsub("+", "%20")
end

def decode_html_entities(value)
  text = value.to_s.dup

  # Known problematic entries contain broken entities that should behave like apostrophes.
  text.gsub!(/&#\d+;/, "'")
  text.gsub!("&amp;", "&")
  text.gsub!("&apos;", "'")
  text.gsub!("&quot;", '"')
  text.gsub!("&lt;", "<")
  text.gsub!("&gt;", ">")

  text
end

def normalize_phrase_spaces(value)
  value.to_s.gsub(/\s+/, " ").strip
end

def sanitize_word_for_fallback(word)
  decoded = decode_html_entities(word)
  safe = decoded.encode("UTF-8", invalid: :replace, undef: :replace, replace: " ")

  basic = safe
    .tr("`", "'")
    .gsub(/[\uFFFD]/, " ")

  compact = basic
    .gsub(/[^A-Za-z0-9\s\-']/, " ")
    .gsub(/\s+/, " ")
    .strip

  no_apostrophe = compact.gsub("'", "")

  variants = [
    normalize_phrase_spaces(decoded),
    normalize_phrase_spaces(compact),
    normalize_phrase_spaces(no_apostrophe)
  ]

  variants.reject(&:empty?).uniq
end

def build_targeted_fallback_urls(task)
  uri = URI.parse(normalize_audio_url(task[:url]))
  return [] unless uri.path

  chapter_dir = File.dirname(uri.path)
  host = "#{uri.scheme}://#{uri.host}"
  if !uri.port.nil? && ((uri.scheme == "http" && uri.port != 80) || (uri.scheme == "https" && uri.port != 443))
    host = "#{host}:#{uri.port}"
  end

  raw_urls = sanitize_word_for_fallback(task[:word]).map do |word_variant|
    "#{host}#{chapter_dir}/#{encode_url_component(word_variant)}.mp3"
  end

  raw_urls.flat_map { |url| build_url_candidates(url) }.uniq
rescue StandardError
  []
end

def extract_error_code(error)
  message = error&.message.to_s
  matched = message.match(/HTTP\s+(\d{3})/)
  return matched[1].to_i if matched

  nil
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
    manifest: DEFAULT_MANIFEST,
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
    opts.banner = "用法: ruby download_audio_dual.rb [options]"

    opts.on("--manifest PATH", "manifest.json 路径") { |v| options[:manifest] = File.expand_path(v) }
    opts.on("--output PATH", "音频输出目录") { |v| options[:output] = File.expand_path(v) }
    opts.on("--chapter ID", "仅处理指定章节") { |v| options[:chapter] = v.to_s.strip }
    opts.on("--concurrency N", Integer, "并发下载数，默认 8") { |v| options[:concurrency] = [v, 1].max }
    opts.on("--retry N", Integer, "失败重试次数，默认 3") { |v| options[:retry] = [v, 1].max }
    opts.on("--timeout N", Integer, "单文件超时秒数，默认 20") { |v| options[:timeout] = [v, 1].max }
    opts.on("--limit N", Integer, "仅处理前 N 条，默认 0(不限制)") { |v| options[:limit] = [v, 0].max }
    opts.on("--force", "覆盖已存在文件") { options[:force] = true }
    opts.on("--dry-run", "只输出计划，不执行下载") { options[:dry_run] = true }
    opts.on("-h", "--help", "显示帮助") do
      puts opts
      exit 0
    end
  end.parse!

  options
end

def build_tasks(manifest_data, options)
  files = manifest_data["files"]
  raise "manifest 格式错误：缺少 files 数组" unless files.is_a?(Array)

  selected = files
  if options[:chapter] && !options[:chapter].empty?
    selected = selected.select { |item| item["chapterId"].to_s == options[:chapter] }
    raise "章节 #{options[:chapter]} 不存在" if selected.empty?
  end

  selected = selected.first(options[:limit]) if options[:limit] > 0

  selected.map do |item|
    chapter_id = item.fetch("chapterId").to_s
    word = item["word"].to_s
    url = item.fetch("url").to_s

    original_relative = item["originalFile"] || item["file"]
    if original_relative.to_s.strip.empty?
      begin
        parsed = URI.parse(url)
        original_relative = parsed.path.sub(%r{^/}, "")
      rescue StandardError
        original_relative = File.join(chapter_id, "#{URI.encode_www_form_component(word)}.mp3")
      end
    end

    word_relative = item["wordFile"]
    if word_relative.to_s.strip.empty?
      word_relative = File.join("by-word", chapter_id, "#{normalize_word_file_name(word)}.mp3")
    end

    {
      chapter_id: chapter_id,
      word: word,
      url: url,
      original_relative_path: original_relative,
      word_relative_path: word_relative,
      original_output_path: File.join(options[:output], original_relative),
      word_output_path: File.join(options[:output], word_relative)
    }
  end
end

def copy_word_named_file(task)
  FileUtils.mkdir_p(File.dirname(task[:word_output_path]))
  FileUtils.cp(task[:original_output_path], task[:word_output_path])
end

def download_with_retry(task, options)
  urls = build_url_candidates(task[:url])
  error = nil
  attempts = options[:retry]
  used_url = urls.first

  urls.each do |url_candidate|
    1.upto(options[:retry]) do |attempt|
      begin
        fetch_to_file(url_candidate, task[:original_output_path], options[:timeout])
        return [true, attempt, nil, url_candidate]
      rescue StandardError => raised_error
        error = raised_error
        attempts = attempt
        used_url = url_candidate
      end
    end
  end

  fallback_urls = build_targeted_fallback_urls(task).reject { |url| urls.include?(url) }
  fallback_urls.each do |url_candidate|
    1.upto(options[:retry]) do |attempt|
      begin
        fetch_to_file(url_candidate, task[:original_output_path], options[:timeout])
        return [true, attempt, nil, url_candidate]
      rescue StandardError => raised_error
        error = raised_error
        attempts = attempt
        used_url = url_candidate
      end
    end
  end

  [false, attempts, error || RuntimeError.new("UNKNOWN"), used_url]
end

def write_failed_log(records)
  return nil if records.empty?

  FileUtils.mkdir_p(DEFAULT_LOG_DIR)
  timestamp = Time.now.strftime("%Y%m%d_%H%M%S")
  path = File.join(DEFAULT_LOG_DIR, "download_audio_failed_#{timestamp}.jsonl")
  File.open(path, "w") do |file|
    records.each { |record| file.puts(JSON.generate(record)) }
  end
  path
end

options = parse_options
manifest_data = JSON.parse(File.read(options[:manifest]))
tasks = build_tasks(manifest_data, options)

puts "Manifest: #{options[:manifest]}"
puts "输出目录: #{options[:output]}"
puts "计划处理: #{tasks.length} 个音频"
puts "并发数: #{options[:concurrency]}，重试次数: #{options[:retry]}"

if tasks.empty?
  puts "没有可处理任务。"
  exit 0
end

if options[:dry_run]
  puts "dry-run 模式，不执行下载。"
  exit 0
end

downloaded = 0
skipped = 0
synced = 0
failed = 0
failed_records = []
mutex = Mutex.new
queue = Queue.new
tasks.each_with_index { |task, index| queue << [task, index] }
started_at = Time.now

workers = Array.new([options[:concurrency], tasks.length].min) do
  Thread.new do
    loop do
      task, index = queue.pop(true)
      prefix = "[#{index + 1}/#{tasks.length}] #{task[:chapter_id]} #{task[:word]}"

      has_original = file_ready?(task[:original_output_path])
      has_word_named = file_ready?(task[:word_output_path])

      if !options[:force] && has_original
        if has_word_named
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
            warn "#{prefix} -> 补齐失败: #{error.message}"
          end
          next
        end
      end

      ok, attempts, error, used_url = download_with_retry(task, options)
      mutex.synchronize do
        if ok
          begin
            copy_word_named_file(task)
            downloaded += 1
            puts "#{prefix} -> 下载成功并生成两份 (尝试 #{attempts} 次)"
          rescue StandardError => copy_error
            failed += 1
            warn "#{prefix} -> 下载成功但复制失败: #{copy_error.message}"
          end
        else
          failed += 1
          failed_records << {
            chapterId: task[:chapter_id],
            word: task[:word],
            url: used_url || task[:url],
            errorCode: extract_error_code(error),
            errorMessage: error.message
          }
          warn "#{prefix} -> 下载失败: #{error.message}"
        end
      end
    rescue ThreadError
      break
    end
  end
end

workers.each(&:join)

duration = (Time.now - started_at).round(1)
puts "完成: 下载 #{downloaded}，补齐 #{synced}，跳过 #{skipped}，失败 #{failed}，耗时 #{duration}s"
failed_log_path = write_failed_log(failed_records)
puts "失败日志: #{failed_log_path}" if failed_log_path
exit(1) if failed.positive?
