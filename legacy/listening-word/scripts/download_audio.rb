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
DEFAULT_SOURCE = File.expand_path("王璐语料库_源码.html", PROJECT_ROOT)
DEFAULT_OUTPUT = File.expand_path("assets/audio", PROJECT_ROOT)
DEFAULT_BASE_URL = "http://www.1kao.com.cn/iSpell/Spell/audio"

def normalize_word_file_name(word)
  word.to_s.strip.gsub(/[\\\/:*?"<>|]/, "_").gsub(/\s+/, "_")
end

def parse_options
  options = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    base_url: DEFAULT_BASE_URL,
    chapter: nil,
    concurrency: 6,
    retry: 3,
    timeout: 15,
    limit: 0,
    force: false,
    dry_run: false
  }

  parser = OptionParser.new do |opts|
    opts.banner = "用法: ruby download_audio.rb [options]"

    opts.on("--source PATH", "语料 HTML 源文件") { |value| options[:source] = File.expand_path(value) }
    opts.on("--output PATH", "音频输出目录") { |value| options[:output] = File.expand_path(value) }
    opts.on("--base-url URL", "音频基地址") { |value| options[:base_url] = value.sub(%r{/$}, "") }
    opts.on("--chapter ID", "仅下载指定章节") { |value| options[:chapter] = value.strip }
    opts.on("--concurrency N", Integer, "并发下载数，默认 6") { |value| options[:concurrency] = [value, 1].max }
    opts.on("--retry N", Integer, "失败重试次数，默认 3") { |value| options[:retry] = [value, 1].max }
    opts.on("--timeout N", Integer, "单文件超时秒数，默认 15") { |value| options[:timeout] = [value, 1].max }
    opts.on("--limit N", Integer, "仅处理前 N 个文件") { |value| options[:limit] = [value, 0].max }
    opts.on("--force", "覆盖已存在文件") { options[:force] = true }
    opts.on("--dry-run", "只输出计划，不实际下载") { options[:dry_run] = true }
    opts.on("-h", "--help", "显示帮助") do
      puts opts
      exit 0
    end
  end

  parser.parse!
  options
end

def extract_chapter_word_sets(source_html)
  match = source_html.match(/const CHAPTER_WORD_SETS = (\{[\s\S]*?\n\});\n\s*const EXPORT_FILE_PREFIX/)
  raise "未能从 HTML 中提取 CHAPTER_WORD_SETS 对象。" unless match

  JSON.parse(match[1])
end

def build_tasks(chapter_word_sets, options)
  entries = chapter_word_sets.sort_by { |chapter_id, _chapter| chapter_id.to_i }
  entries = entries.select { |chapter_id, _chapter| chapter_id == options[:chapter] } if options[:chapter]

  if options[:chapter] && entries.empty?
    raise "章节 #{options[:chapter]} 不存在。"
  end

  tasks = entries.flat_map do |chapter_id, chapter|
    chapter.fetch("words").map do |word|
      encoded_word = URI.encode_www_form_component(word)
      word_file_name = "#{normalize_word_file_name(word)}.mp3"
      {
        chapter_id: chapter_id,
        chapter_title: chapter.fetch("title"),
        word: word,
        url: "#{options[:base_url]}/#{URI.encode_www_form_component(chapter_id)}/#{encoded_word}.mp3",
        original_relative_path: File.join(chapter_id, "#{encoded_word}.mp3"),
        original_output_path: File.join(options[:output], chapter_id, "#{encoded_word}.mp3"),
        word_relative_path: File.join("by-word", chapter_id, word_file_name),
        word_output_path: File.join(options[:output], "by-word", chapter_id, word_file_name)
      }
    end
  end

  options[:limit] > 0 ? tasks.first(options[:limit]) : tasks
end

def write_manifest(tasks, output_dir)
  FileUtils.mkdir_p(output_dir)
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
  File.write(File.join(output_dir, "manifest.json"), JSON.pretty_generate(manifest))
end

def file_ready?(file_path)
  File.file?(file_path) && File.size?(file_path)
end

def fetch_to_file(url_string, target_path, timeout_seconds, limit = 5)
  raise "重定向次数过多" if limit <= 0

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
      fetch_to_file(redirected_url, target_path, timeout_seconds, limit - 1)
    else
      raise "HTTP #{response.code}"
    end
  end
rescue StandardError
  FileUtils.rm_f("#{target_path}.part")
  raise
end

def download_with_retry(task, options)
  attempts = options[:retry]

  1.upto(attempts) do |attempt|
    begin
      fetch_to_file(task[:url], task[:original_output_path], options[:timeout])
      return [true, attempt, nil]
    rescue StandardError => error
      return [false, attempt, error] if attempt == attempts
    end
  end

  [false, attempts, RuntimeError.new("UNKNOWN")]
end

def copy_word_named_file(task)
  FileUtils.mkdir_p(File.dirname(task[:word_output_path]))
  FileUtils.cp(task[:original_output_path], task[:word_output_path])
end

options = parse_options
source_html = File.read(options[:source])
chapter_word_sets = extract_chapter_word_sets(source_html)
tasks = build_tasks(chapter_word_sets, options)

write_manifest(tasks, options[:output])

puts "源文件: #{options[:source]}"
puts "输出目录: #{options[:output]}"
puts "计划处理: #{tasks.length} 个音频文件"
puts "并发数: #{options[:concurrency]}，重试次数: #{options[:retry]}"

if tasks.empty?
  puts "没有可处理的音频任务。"
  exit 0
end

if options[:dry_run]
  puts "dry-run 模式，不执行实际下载。"
  exit 0
end

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
            puts "#{prefix} -> 两份文件已存在，跳过"
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
            warn "#{prefix} -> 补齐单词命名文件失败: #{error.message}"
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
            puts "#{prefix} -> 下载完成并生成两份文件 (尝试 #{attempts} 次)"
          rescue StandardError => copy_error
            failed += 1
            warn "#{prefix} -> 下载成功但生成单词命名文件失败: #{copy_error.message}"
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