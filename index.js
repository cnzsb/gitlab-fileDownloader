const Crawler = require('./crawler')

const crawler = new Crawler({
  url: '',
  username: '',
  password: ''
})

crawler.run()