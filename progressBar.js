/**
 * Created by cnzsb on 2017/7/12.
 */
const log = require('single-line-log').stdout

class ProgressBar {
  constructor(opts) {
    this.opts = Object.assign({
      description: '',
      amount: '',
      width: 20,
    }, opts)
  }

  log(count, msg = '') {
    const { description, amount, width } = this.opts
    const filledPercent = count / amount
    const filled = Math.floor(filledPercent * width)
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
    const desp = description ? `${description}: ` : ''
    const percent = `${(filledPercent * 100).toFixed(2)}% (${count}/${amount})`
    log(`${desp}${bar} ${percent}${msg ? ` ${msg}`: ''}`)
  }
}

module.exports = ProgressBar