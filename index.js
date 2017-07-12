const Crawler = require('./crawler')

const crawler = new Crawler({
  url: '',
  username: '',
  password: '',
  path: '',
  deep: true
})

crawler.run()