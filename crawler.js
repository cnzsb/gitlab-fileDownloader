const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs')
const qs = require('querystring')
const URL = require('url')

const $http = axios.create({
  withCredentials: true,
  // maxRedirects: 0,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'zh-CN,zh;q=0.8,en;q=0.6,zh-TW;q=0.4',
  },
  validateStatus: function (status) {
    return status >= 200 && status < 300 || status === 302  // gitlab 登录 302 重定向
  },
})

class Crawler {
  constructor(opts) {
    this.opts = Object.assign({
      url: '',
      username: '',
      password: '',
      deep: false,
      path: './downloads',
      cookie: {
        value: '',
        expires: 0,
      },
    }, opts)

    const urlObj = URL.parse(this.opts.url)
    this.opts.urlOrigin = `${urlObj.protocol}//${urlObj.host}`
  }

  run() {
    this.getDicts()
  }

  async getDicts() {
    try {
      if (!this.opts.cookie.value || (this.opts.cookie.expires <= Date.now())) await this.login()
      console.log('已找到目标网址，正在解析文件目录...\n')
      const { data } = await $http.get(this.opts.url, { headers: { Cookie: this.opts.cookie.value } })
      const $ = cheerio.load(data)
      if ($('[content="Sign in"]').length) {
        this.opts.cookie.value = ''
        return this.getDicts()
      }

      const dicts = []
      $('.tree-table .tree-item .tree-item-file-name a').each((index, item) => {
        const name = $(item).attr('title')
        const url = `${this.opts.urlOrigin}${$(item).attr('href').replace('/blob/', '/raw/')}`
        if (!name || !url.includes('/raw/')) return
        dicts.push({ name, url })
      })
      if (!dicts.length) throw new Error('没有可下载资源')
      console.log(`共找到 ${dicts.length} 个文件，开始下载...\n==============================\n`)
      this._download(dicts)
    } catch (e) {
      console.error('Error Getting Dictionaries: ', e)
    }
  }

  login() {
    return new Promise(async (resolve, reject) => {
      try {
        const { urlOrigin } = this.opts
        const urlSignIn = `${urlOrigin}/users/sign_in`
        const resPageSignIn = await $http.get(urlSignIn)
        this._writeCookie(resPageSignIn.headers)
        const $ = cheerio.load(resPageSignIn.data)
        const $form = $('.login-body form')
        const action = $form.attr('action')
        const method = $form.attr('method')
        const params = {}
        params.utf8 = $form.find('[name="utf8"]').attr('value')
        params.authenticity_token = $form.find('[name="authenticity_token"]').attr('value')
        params.remember_me = 1  // true
        params.username = this.opts.username
        params.password = this.opts.password

        const reqOpts = {
          maxRedirects: 0,
          headers: {
            Cookie: this.opts.cookie.value,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': JSON.stringify(params).length
          }
        }
        // 302
        const resLogin = await $http[method](`${urlOrigin}${action}`, qs.stringify(params), reqOpts)
        this._writeCookie(resLogin.headers)
        return resolve()
      } catch (e) {
        console.error('Error On Page SignIn: ', e)
        return reject(e)
      }
    })
  }

  _writeCookie(headers) {
    const reg = /((?:_gitlab_session|remember_user_token)=[^;]*)/gi
    const regExpires = /expires=([^;]*)/gi
    let expires = Date.now()
    let cookies = []
    headers['set-cookie'].forEach(item => {
      const matched = item.match(reg)
      const matchedExpires = item.match(regExpires)
      if (matched) cookies.push(matched[0])
      if (matchedExpires) expires = new Date(matchedExpires[0]).getTime()
    })
    this.opts.cookie = {
      value: cookies.join(';'),
      expires
    }
  }

  _download(dicts) {
    const count = dicts.length
    let index = 0
    const path = this.opts.path
    const headers = { Cookie: this.opts.cookie.value }
    if (!fs.existsSync(path)) fs.mkdirSync(path)
    return (async function downloadFile(source) {
      index++
      console.log(`--- ${index} / ${count} : ${source.name} ---\n`)
      const { data } = await $http.get(source.url, {
        responseType: 'stream',
        headers,
      })
      data.pipe(fs.createWriteStream(`${path}/${source.name}`))
      console.log(`--- ${index} / ${count} 下载完毕 ---\n`)

      if (!dicts.length) return console.log(`==============================\n所有文件下载至路径 ${path} 完毕，请打开文件夹查看\n`)
      return downloadFile(dicts.shift())
    })(dicts.shift())
  }
}

module.exports = Crawler