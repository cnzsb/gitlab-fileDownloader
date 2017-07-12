const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs')
const qs = require('querystring')
const URL = require('url')
const path = require('path')

const $http = axios.create({
  withCredentials: true,   // 获取 Cookie
  // maxRedirects: 0,      // 不重定向
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'zh-CN,zh;q=0.8,en;q=0.6,zh-TW;q=0.4',
  },
  validateStatus: status => (status >= 200 && status < 300 || status === 302)  // gitlab 登录 302 重定向
})

/**
 * 递归创建文件夹
 * @param filepath {String}
 */
function mkdirSync(filepath) {
  if (fs.existsSync(filepath)) return
  mkdirSync(path.dirname(filepath))
  fs.mkdirSync(filepath)
}

class Crawler {
  constructor(opts) {
    this.opts = Object.assign({
      url: '',
      username: '',
      password: '',
      deep: false,      // 是否下载文件夹内容
      path: './downloads',  // 下载路径
      cookie: {
        value: '',
        expires: 0,
      },
    }, opts)
    if (!this.opts.path.endsWith('/')) this.opts.path += '/'

    const urlObj = URL.parse(this.opts.url)
    this.opts.urlOrigin = `${urlObj.protocol}//${urlObj.host}`
  }

  async run() {
    console.log('开始解析目录...')
    const dicts = await this.getDict()
    if (!dicts.length) return console.log('没有可下载资源')
    console.log(`共找到 ${dicts.length} 个文件，开始下载...\n==============================\n`)
    await this._download(dicts)
  }

  async getDict(urlTarget = this.opts.url, dirname = '') {
    try {
      if (!this.opts.cookie.value || (this.opts.cookie.expires <= Date.now())) await this.login()
      const { data } = await $http.get(urlTarget, { headers: { Cookie: this.opts.cookie.value } })
      const $ = cheerio.load(data)
      if ($('[content="Sign in"]').length) {
        this.opts.cookie.value = ''
        return this.getDict()
      }

      const $files = $('.tree-table .tree-item .tree-item-file-name a')
      const dicts = []
      for (let i = 0; i < $files.length; i++) {
        const $file = $files.eq(i)
        const name = $file.attr('title')
        const url = `${this.opts.urlOrigin}${$file.attr('href').replace('/blob/', '/raw/')}`
        // 根目录 '..' 没有 name
        if (!name) continue
        if (!url.includes('/raw/')) {
          // 同步使结果可控
          if (this.opts.deep) dicts.push(...await this.getDict(url, `${dirname}${name}/`))
          continue
        }

        dicts.push({ name, url, dirname })
      }
      return Promise.resolve(dicts)
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
    const root = this.opts.path
    const count = dicts.length
    let index = 0
    const headers = { Cookie: this.opts.cookie.value }
    return (async function downloadFile(source) {
      index++
      console.log(`--- ${index} / ${count} : ${source.name} ---\n`)
      const dirname = `${root}${source.dirname}`
      if (!fs.existsSync(dirname)) mkdirSync(dirname)

      const { data } = await $http.get(source.url, {
        responseType: 'stream',
        headers,
      })
      data.pipe(fs.createWriteStream(`${dirname}/${source.name}`))

      if (!dicts.length) return console.log(`==============================\n所有文件下载至路径 ${root} 完毕，请打开文件夹查看\n`)
      return downloadFile(dicts.shift())
    })(dicts.shift())
  }
}

module.exports = Crawler