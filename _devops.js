const { launchWrapper } = require('./mac_headful');
const { do_insert_general, clear_devops, connectConn, endConn } = require('./dbhelper')

async function loadDevopsData() {
  var _rawDataProcessor = new RawDataProcessor()
  await launchWrapper(async function (page, browser) {
    await connectConn()
    await clear_devops()
    await page.goto('https://dev.azure.com/encootech/%E9%A1%B9%E7%9B%AE%E4%BA%A4%E4%BB%98/_queries/query/bf7aa555-aace-4b7c-b379-9ed1880900af/', {
      waitUntil: "domcontentloaded", timeout: 0
    });
    await page.waitForXPath(`//input[@type='email']`, { timeout: 0 })
    await (await page.$x(`//input[@type='email']`))[0].type('silver.sun@encoo.com')
    await (await page.$x(`//input[@type='submit']`))[0].click()
    await page.waitForXPath(`//input[@type='password']`, { timeout: 0 })
    await (await page.$(`[type=password]`)).type('Encootech@123')
    console.log('将要点击登录。。。')
    if (process.env.NODE_ENV == 'prod') {
      await page.waitForXPath(`//input[@value='Sign in']`, { timeout: 0 })
    } else {
      await page.waitForXPath(`//input[@value='登录']`, { timeout: 0 })
    }
    await (await page.$x(`//input[@type='submit']`))[0].click()
    console.log('登录完成。。。')
    await page.waitForNavigation({
      waitUntil: 'domcontentloaded', timeout: 0
    })
    await page.waitForXPath(`//input[@id='idSIButton9']`, { timeout: 0 })
    await (await page.$x(`//input[@id='idSIButton9']`))[0].click()
    await page.waitForNavigation({
      waitUntil: 'domcontentloaded', timeout: 0
    })
    // await page.setCacheEnabled(false)
    await page.waitForXPath(`//*[contains(@class,'grid-row')]`, { timeout: 0 })
    var lastRowId = null
    const startTime = Date.now()
    while (true) {
      const rows = await getCurrentRows(page)
      // console.log(`rows: ${JSON.stringify(rows)}`)
      const newLastRowId = rows[rows.length - 1].row_id
      if (newLastRowId != lastRowId) {
        for (const row of rows) {
          await _rawDataProcessor.insertData(row)
        }
        // console.log('--------')
        const boundingBox = await (await page.$x(`//*[@class='grid-canvas']`))[0].boundingBox()
        await page.mouse.move(boundingBox.x + 200, boundingBox.y + 200)
        for (var i = 0; i < 10; ++i) {
          await page.mouse.wheel({ deltaY: 50 })
          await wait4(0.05)
        }
        lastRowId = newLastRowId
        console.log(`rows:${_rawDataProcessor.rows.length} 总耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}s`)
      } else {
        break
      }
    }
    // validate
    console.log(`exp deevops total count: ${_rawDataProcessor.rows.length}`)
    var rowIdSet = new Set()
    _rawDataProcessor.rows.forEach(p => {
      rowIdSet.add(p.row_id)
    })
    console.log(`exp deevops distinct count: ${rowIdSet.size}`)
    // await wait4(5000)
  })
  await endConn()
}

async function getCurrentRows(page) {
  while (true) {
    var row_results = await page.evaluate(() => {
      return [...window.document.querySelectorAll('.grid-row')].map(p => {
        const row_id = p.id
        const cells = p.querySelectorAll('.grid-cell')
        const id = cells[2].innerHTML
        const workItemType = cells[3].innerHTML
        const titleEl = cells[4].querySelector('.work-item-title-link')
        const title = titleEl ? titleEl.innerHTML : ''
        const assignedToEl = cells[5].querySelector('.identity-picker-resolved-name')
        const assignedTo = assignedToEl ? assignedToEl.innerHTML : ''
        const assignedToEmailEl = cells[5].querySelector('.identity-picker-display')
        const assignedToEmail = assignedToEmailEl ? assignedToEmailEl.getAttribute('data-signin') : ''
        const stateEl = cells[6].querySelector('.workitem-state-value')
        const state = stateEl ? stateEl.innerText : ''
        // const tags = [...cells[7].querySelectorAll('.tag-box')].map(p => p.innerText).join(',')
        const tags = ''
        const level = p.getAttribute("aria-level")
        const link = titleEl.href
        let workTime = cells[7].innerHTML
        workTime = Number.parseFloat(workTime)
        if (Number.isNaN(workTime)) {
          workTime = null
        }
        let startDate = cells[8].innerHTML
        startDate = new Date(startDate).valueOf()
        if (Number.isNaN(startDate)) {
          startDate = null
        }
        let finishDate = cells[9].innerHTML
        finishDate = new Date(finishDate).valueOf()
        if (Number.isNaN(finishDate)) {
          finishDate = null
        }
        return {
          row_id, id, workItemType, title, assignedTo, assignedToEmail, state, tags, link, level,
          workTime, startDate, finishDate
        }
      })
    })
    if (row_results.some(p => !p.workItemType || p.workItemType == '&nbsp;')) {
      await wait4(2)
    } else {
      break
    }
  }
  // console.log(row_results)
  return row_results
}

function wait4(sec) {
  return new Promise(done => {
    setTimeout(() => {
      done()
    }, sec * 1000);
  })
}

class RawDataProcessor {
  constructor() {
    this.lastRowId = null
    this.rows = []
    this.currentCustomer = null
    this.currentOrder = null
    this.currentLevelIds = []
  }
  async insertData(data) {
    const insertOrNot = this.__filterRawData(data)
    if (insertOrNot) {
      await this.__doInsert(data)
    }
  }
  __filterRawData(data) {
    // console.log(`__filterRawData ${JSON.stringify(data)}`)
    var mat = /^row_vss_4_(?<__id>\d+)$/.exec(data.row_id)
    if (!mat) {
      console.error('rowid格式不对，应该是row_vss_4_[数字]')
      return false
    }
    const { groups: { __id } } = mat

    if (!this.lastRowId) {
      this.lastRowId = __id
      return true
    } else {
      var _id = Number.parseInt(__id)
      var _lastRowId = Number.parseInt(this.lastRowId)
      if (_lastRowId >= _id) {
        return false
      }
      this.lastRowId = __id
      return true
    }
  }
  async __doInsert(data) {
    this.rows.push(data)
    const level = parseInt(data.level)
    this.currentLevelIds[level - 1] = data.id
    const parentId = level > 1 ? this.currentLevelIds[level - 2] : null
    const customerId = this.currentLevelIds[0]
    const workloadData = {
      id: data.id,
      work_item_type: data.workItemType,
      level: parseInt(data.level),
      title: data.title,
      assigned_to: data.assignedTo,
      assigned_to_email: data.assignedToEmail,
      state: data.state,
      tags: data.tags,
      work_time: data.workTime,
      start_date: data.startDate,
      finish_date: data.finishDate,
      customer_id: customerId,
      parent_id: parentId
    }
    await do_insert_general('devops_workload', workloadData)
    if (data.workItemType == '客户') {
      this.currentCustomer = {
        customer_id: data.id,
        customer_title: data.title,
        customer_assigned_to: data.assignedTo,
        customer_state: data.state,
        parent_id: parentId
      }
      this.currentOrder = {
        order_id: '',
        order_title: '',
        order_assigned_to: '',
        order_state: '',
        customer_id: this.currentCustomer.customer_id,
        parent_id: parentId
      }
      await do_insert_general('devops_customer', this.currentCustomer)
    } else if (data.workItemType == '订单') {
      if (!this.currentCustomer) {
        console.error(`订单 [${data.title}] 没有所属客户`)
        return
      }
      this.currentOrder = {
        order_id: data.id,
        order_title: data.title,
        order_assigned_to: data.assignedTo,
        order_state: data.state,
        customer_id: this.currentCustomer.customer_id,
        start_date: data.startDate,
        finish_date: data.finishDate,
        parent_id: parentId
      }
      await do_insert_general('devops_order', this.currentOrder)
    } else if (data.workItemType == '流程') {
      if (!this.currentCustomer) {
        console.error(`流程 [${data.title}] 没有所属客户`)
        return
      }
      const flow = {
        ...this.currentCustomer,
        ...this.currentOrder,
        flow_id: data.id,
        flow_title: data.title,
        flow_assigned_to: data.assignedTo,
        flow_state: data.state,
        flow_tags: data.tags,
        flow_work_time: data.workTime,
        start_date: data.startDate,
        finish_date: data.finishDate,
        parent_id: parentId
      }
      await do_insert_general('devops_flow', flow)
    } else if (data.workItemType == '任务') {
      if (!this.currentCustomer) {
        console.error(`任务 [${data.title}] 没有所属客户`)
        return
      }
      const currentTask = {
        task_id: data.id,
        task_title: data.title,
        task_assigned_to: data.assignedTo,
        task_state: data.state,
        customer_id: this.currentCustomer.customer_id,
        link: data.link,
        start_date: data.startDate,
        finish_date: data.finishDate,
        parent_id: parentId
      }
      await do_insert_general('devops_task', currentTask)
    }
  }
}

exports = module.exports = loadDevopsData