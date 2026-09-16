step1
https://v.guixue.com/ApiDictaction/dictationBookDetail?book_id=10174
雅思真经这本书的单元分布情况 ，下面是返回结果:[text](分组数据demo.json)

重要的信息是
data.sub_step.title
data.sub_step.sub_step.level
data.sub_step.sub_step.book_id
data.sub_step.sub_step.book_hierarchy_id


step2
然后  获取这个章节的单词
curl -X GET "https://v.guixue.com/ApiDictaction/getPracticePageInfo?book_id=10174&book_hierarchy_id=21798" \
  -H "authorization: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI4MjY3NjMyNSIsIm5hbWUiOiIjd3hfXHUzMDAwXHUzMDAwXHUzMDAwICAgICAgICAgICAgICAuLi4iLCJpYXQiOjE3NzcyMTE3NzMsInBsYXQiOiJ3ZWIifQ.HtPPiHHzaSUfyv95QPiauADnqqyWL6me0B7NL0ILiys"
下面是返回结果:分组数据demo.json
在字段data.words




step3
根据step1的数据 每隔2s获取1组step2的数据
然后每组数据进行保存到一个单独的json文件中
  格式
  {章节名，组号,words}
