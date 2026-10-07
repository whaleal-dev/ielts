#!/usr/bin/env ruby

require "json"
require "fileutils"
require "net/http"
require "uri"
require "optparse"
require "thread"
require "time"

SCRIPT_DIR = __dir__
LISTENING_WORD_ROOT = File.expand_path("..", SCRIPT_DIR)
PROJECT_ROOT = File.expand_path("../..", SCRIPT_DIR)
DEFAULT_SOURCE = File.join(PROJECT_ROOT, "words", "study_words.html")
DEFAULT_OUTPUT = File.join(LISTENING_WORD_ROOT, "assets", "audio")

def normalize_word_file_name(word)
  word.to_s.strip.gsub(/[\\\/:*?"<>|]/, "_").gsub(/\s+/, "_")
end

def file_ready?(path)
  File.file?(path) && File.size?(path)
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
    opts.banner = "用法: ruby download_audio_from_study_words_dual.rb [options]"

    opts.on("--source PATH", "study_words.html 路径") { |v| options[:source] = File.expand_path(v) }
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

def extract_audio_items_from_html(html)
  match = html.match(/window\.LISTENING_WORD_AUDIO_DATA\s*=\s*(\[[\s\S]*?\]);/)
  raise "未在 HTML 中找到 LISTENING_WORD_AUDIO_DATA 数据。" unless match

  JSON.parse(match[1])
end

def extract_original_relative_path(url, chapter_id)
  uri = URI.parse(url)
  path = uri.path.to_s
  marker = "/audio/"
  idx = path.index(marker)
  return path[(idx + marker.length)..].to_s.sub(%r{^/}, "") if idx

  file_name = File.basename(path)
  File.join(chapter_id.to_s, file_name)
rescue StandardError
  File.join(chapter_id.to_s, "unknown.mp3")
end

def build_tasks(items, options)
  selected = items
  if options[:chapter] && !options[:chapter].empty?
    selected = selected.select { |item| item["chapterId"].to_s == options[:chapter] }
    raise "章节 #{options[:chapter]} 不存在" if selected.empty?
  end

  selected = selected.first(options[:limit]) if options[:limit] > 0

  unique = {}
  selected.each do |item|
    word = item["word"].to_s
    url = item["mp3Path"].to_s
    chapter_id = item["chapterId"].to_s
    next if word.empty? || url.empty? || chapter_id.empty?

    original_relative = extract_original_relative_path(url, chapter_id)
    word_relative = File.join("by-word", chapter_id, "#{normalize_word_file_name(word)}.mp3")
    key = "#{original_relative}::#{word_relative}"
    unique[key] ||= {
      chapter_id: chapter_id,
      chapter_title: item["chapterTitle"].to_s,
      word: word,
      url: url,
      original_relative_path: original_relative,
      word_relative_path: word_relative,
      original_output_path: File.join(options[:output], original_relative),
      word_output_path: File.join(options[:output], word_relative)
    }
  end

  unique.values
end

def copy_word_named_file(task)
  FileUtils.mkdir_p(File.dirname(task[:word_output_path]))
  FileUtils.cp(task[:original_output_path], task[:word_output_path])
end

def download_with_retry(task, options)
  1.upto(options[:retry]) do |attempt|
    begin
      fetch_to_file(task[:url], task[:original_output_path], options[:timeout])
      return [true, attempt, nil]
    rescue StandardError => error
      return [false, attempt, error] if attempt == options[:retry]
    end
  end

  [false, options[:retry], RuntimeError.new("UNKNOWN")]
end

def write_manifest(tasks, output)
  manifest = {
    generatedAt: Time.now.iso8601,
    total: tasks.length,
    files: tasks.map do |task|
      {
        chapterId: task[:chapter_id],
        chapterTitle: task[:chapter_title],
        word: task[:word],
        url: task[:url],
        file: task[:original_relative_path],
        originalFile: task[:original_relative_path],
        wordFile: task[:word_relative_path]
      }
    end
  }

  FileUtils.mkdir_p(output)
  File.write(File.join(output, "manifest.json"), JSON.pretty_generate(manifest))
end

options = parse_options
html = File.read(options[:source])
items = extract_audio_items_from_html(html)
tasks = build_tasks(items, options)

puts "来源: #{options[:source]}"
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

write_manifest(tasks, options[:output])

downloaded = 0
skipped = 0
synced = 0
failed = 0
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

      ok, attempts, error = download_with_retry(task, options)
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
exit(1) if failed.positive?