// End-to-end smoke test against a locally running TeamOS server.
//
//   DATA_DIR=.e2e-data PORT=8080 HERMES_AUTO_START=false node server/index.mjs
//   BASE_URL=http://127.0.0.1:8080 DEEPSEEK_API_KEY=... node scripts/e2e-smoke.mjs
//
// Use a fresh data directory: the script registers the first admin itself.
// The DeepSeek key is read from the environment and never printed.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080'
const KEY = process.env.DEEPSEEK_API_KEY || ''
if (!KEY) {
  console.error('DEEPSEEK_API_KEY is required')
  process.exit(1)
}

let failures = 0
function ok(label, detail = '') {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
}
function fail(label, detail = '') {
  failures += 1
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
}
function check(label, condition, detail = '') {
  if (condition) ok(label, detail)
  else fail(label, detail)
}

class Client {
  constructor(name) {
    this.name = name
    this.cookie = ''
  }
  async call(path, { method = 'GET', body, raw, headers = {} } = {}) {
    const init = { method, headers: { accept: 'application/json', ...headers } }
    if (this.cookie) init.headers.cookie = this.cookie
    if (raw !== undefined) {
      init.body = raw
      init.headers['content-type'] = headers['content-type'] || 'application/octet-stream'
    } else if (body !== undefined) {
      init.body = JSON.stringify(body)
      init.headers['content-type'] = 'application/json'
    }
    const response = await fetch(`${BASE}${path}`, init)
    const setCookies = response.headers.getSetCookie?.() ?? []
    if (setCookies.length) this.cookie = setCookies.map((item) => item.split(';')[0]).join('; ')
    const text = await response.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: response.status, json, text }
  }
}

async function sse(client, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', cookie: client.cookie },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const events = []
  for (const block of text.split('\n\n')) {
    const eventMatch = /^event: (.+)$/m.exec(block)
    const dataMatch = /^data: (.+)$/m.exec(block)
    if (eventMatch && dataMatch) {
      let data = null
      try {
        data = JSON.parse(dataMatch[1])
      } catch {
        data = dataMatch[1]
      }
      events.push({ event: eventMatch[1], data })
    }
  }
  return { status: response.status, events }
}

const admin = new Client('admin')
const employee = new Client('employee')
const stamp = Date.now()
const adminAccount = `admin${stamp}@e2e.local`
const employeeAccount = `employee${stamp}@e2e.local`

// 1. 管理员注册
const health = await admin.call('/api/health')
check('服务健康检查', health.status === 200 && health.json?.ok, `revision=${health.json?.revision}`)
const adminRegister = await admin.call('/api/auth/register', {
  method: 'POST',
  body: {
    name: '端到端管理员',
    account: adminAccount,
    password: 'AdminE2E123!',
    companyName: '端到端测试公司',
  },
})
check('管理员注册', adminRegister.status === 201 && adminRegister.json?.authenticated, `role=${adminRegister.json?.user?.role}`)
check('首位用户是管理员', adminRegister.json?.user?.role === 'admin')
const adminMember = adminRegister.json?.user?.member
check('注册后生成管理员会话', Boolean(adminRegister.json?.state?.sessions?.length), `sessions=${adminRegister.json?.state?.sessions?.length}`)

// 2. 员工注册 → 待审批 → 登录被拒
const employeeRegister = await employee.call('/api/auth/register', {
  method: 'POST',
  body: {
    name: '端到端员工',
    account: employeeAccount,
    password: 'EmployeeE2E123!',
    jobTitle: '市场专员',
    department: '市场部',
  },
})
check('员工注册进入待审批', employeeRegister.status === 201 && employeeRegister.json?.pending === true, employeeRegister.json?.message)
const blockedLogin = await employee.call('/api/auth/login', {
  method: 'POST',
  body: { email: employeeAccount, password: "EmployeeE2E123!" },
})
check('未审批员工无法登录', blockedLogin.status === 403, blockedLogin.json?.error)

// 3. 管理员审批员工
let adminState = (await admin.call('/api/state')).json?.state
const pendingMember = (adminState?.members ?? []).find((item) => item.email === employeeAccount)
check('管理员能看到待审批员工', Boolean(pendingMember), pendingMember?.status)
if (!pendingMember) {
  console.log('ABORT: pending member not found')
  process.exit(1)
}
const approveRes = await admin.call(`/api/members/${pendingMember.id}`, {
  method: 'PATCH',
  body: { status: 'active' },
})
check('管理员审批员工', approveRes.status === 200, `member=${approveRes.json?.member?.status}`)

const employeeLogin = await employee.call('/api/auth/login', {
  method: 'POST',
  body: { email: employeeAccount, password: "EmployeeE2E123!" },
})
check('审批后员工可登录', employeeLogin.status === 200 && employeeLogin.json?.authenticated, `role=${employeeLogin.json?.user?.role}`)
const employeeMember = employeeLogin.json?.user?.member
adminState = (await admin.call('/api/state')).json?.state

// 4. 员工建立自己的会话（与前端新建会话等价）
const sessionId = `sess_e2e_${stamp}`
const statePut = await employee.call('/api/state', {
  method: 'PUT',
  body: {
    state: {
    sessions: [
      {
        id: sessionId,
        title: '端到端测试会话',
        createdBy: employeeMember?.id,
        createdAt: new Date().toISOString(),
        messageCount: 0,
        summary: [],
        memory: [],
        tokenEstimate: 0,
      },
    ],
    activeSessionId: sessionId,
    },
  },
})
check('员工创建会话', statePut.status === 200 || statePut.status === 201, `sessions=${statePut.json?.state?.sessions?.length ?? statePut.json?.sessions?.length} ${statePut.text?.slice(0,120)}`)

// 5. 模型目录 → 选择 flash 模型 → 保存 → 连通性测试
const catalog = await admin.call('/api/model/catalog', {
  method: 'POST',
  body: { provider: 'deepseek', apiKey: KEY },
})
const models = (catalog.json?.models ?? []).filter((item) => typeof item === 'string')
check('DeepSeek 模型目录可用', catalog.status === 200 && models.length > 0, models.join(', ').slice(0, 160))
const chosen = models.find((id) => /flash/i.test(id)) || models.find((id) => /chat/i.test(id)) || models[0]
check('选择 flash 模型', Boolean(chosen), chosen)
const saveModel = await admin.call('/api/model', {
  method: 'PUT',
  body: { provider: 'deepseek', model: chosen, apiKey: KEY },
})
check('保存模型配置', saveModel.status === 200 && saveModel.json?.ok, `model=${saveModel.json?.model?.model}`)
check('API Key 只显示掩码', Boolean(saveModel.json?.model?.keyHint) && !String(saveModel.json?.model?.keyHint).includes(KEY.slice(8, 20)), saveModel.json?.model?.keyHint)
const modelTest = await admin.call('/api/model/test', { method: 'POST' })
check('模型连通性测试', modelTest.status === 200 && modelTest.json?.ok, `${modelTest.json?.backend} ${modelTest.json?.latencyMs}ms reply=${modelTest.json?.reply} ${modelTest.json?.error ?? ''}`)

// 6. 员工上传文档 → @通用助理 归档 → 待审批
const handbook = [
  '报销与差旅制度（2026 版）',
  '',
  '1. 出差住宿标准：一线城市每晚不超过 480 元，其他城市每晚不超过 350 元。',
  '2. 报销时限：费用发生后 14 天内提交，逾期需要部门负责人书面说明。',
  '3. 审批流程：员工提交 → 部门负责人 → 财务复核。',
  '4. 接触客户资料统一归档到企业知识库，权限由管理员设置。',
].join('\n')
const upload = await employee.call('/api/files?purpose=knowledge&name=' + encodeURIComponent('员工手册-报销制度.txt'), {
  method: 'POST',
  raw: Buffer.from(handbook, 'utf8'),
  headers: { 'content-type': 'text/plain; charset=utf-8' },
})
const file = upload.json?.file
check('上传知识文档并抽取正文', upload.status === 201 && file?.id, `id=${file?.id} text=${Boolean(file?.hasText)}`)
const archived = await sse(employee, '/api/chat', {
  agentId: 'a_general',
  sessionId,
  message: '请把附件归档到知识库，记住这份报销制度。',
  attachmentIds: [file.id],
  runId: `run_e2e_${stamp}_1`,
  messageId: `m_e2e_${stamp}_1`,
})
const notes = archived.events.filter((item) => item.event === 'note').map((item) => item.data?.text)
const done1 = archived.events.find((item) => item.event === 'done')
const error1 = archived.events.find((item) => item.event === 'error')
check('助理归档附件', archived.status === 200 && Boolean(done1) && notes.some((text) => /审批/.test(text ?? '')), notes.join(' | ') || error1?.data?.error)
check('归档提示 7 天有效期', notes.some((text) => /7 天/.test(text ?? '')))

// 7. 管理员审批知识，员工可见完整正文
adminState = (await admin.call('/api/state')).json?.state
const pendingDoc = (adminState?.knowledgeDocs ?? []).find((doc) => doc.status === 'review' && doc.fileId === file.id)
check('知识库出现待审批条目', Boolean(pendingDoc), `doc=${pendingDoc?.title} expires=${pendingDoc?.expiresAt}`)
if (pendingDoc) {
  const approveDoc = await admin.call(`/api/knowledge/${pendingDoc.id}/approve`, { method: 'POST' })
  check('管理员通过知识审批', approveDoc.status === 200)
  adminState = approveDoc.json?.state ?? (await admin.call('/api/state')).json?.state
  const approvedDoc = (adminState?.knowledgeDocs ?? []).find((doc) => doc.id === pendingDoc.id)
  check('审批后状态为 ready 且不过期', approvedDoc?.status === 'ready' && approvedDoc?.expiresAt === null, `content=${approvedDoc?.content?.length ?? 0} 字`)
  const textRes = await admin.call(`/api/files/${file.id}/text`)
  check('管理员可读取文档正文', textRes.status === 200 && /480 元/.test(textRes.json?.text ?? ''))
  const download = await fetch(`${BASE}/api/files/${file.id}?inline=1`, { headers: { cookie: employee.cookie } })
  const downloaded = await download.text()
  check('员工可下载已审批文件', download.status === 200 && downloaded.includes('480 元'), `${download.status} ${download.headers.get('content-type')}`)
}

// 8. 企业知识检索：回答应引用文档
const ask = await sse(employee, '/api/chat', {
  agentId: 'a_general',
  sessionId,
  message: '根据公司知识库，出差住宿报销标准是多少？只回答标准数字。',
  runId: `run_e2e_${stamp}_2`,
  messageId: `m_e2e_${stamp}_2`,
})
const done2 = ask.events.find((item) => item.event === 'done')
const sources = done2?.data?.sources ?? []
const deltas = ask.events.filter((item) => item.event === 'delta').map((item) => item.data?.text ?? '').join('')
check('知识库检索命中审批文档', sources.some((source) => /员工手册-报销制度/.test(source.title ?? source.label ?? '')), JSON.stringify(sources))
check('模型回答引用报销标准', /480/.test(deltas), deltas.slice(0, 120))

// 9. 会议纪要：文字稿 → 模型总结 → 编辑保存
const summarize = await employee.call('/api/meetings/summarize', {
  method: 'POST',
  body: {
    title: 'Q4 市场预算评审',
    transcript: [
      '主持人：今天确认 Q4 市场预算和渠道排期。',
      '李明：线上投放预算建议 30 万元，重点放在搜索和内容合作。',
      '王芳：线下展会预算 12 万元，10 月中旬的行业展必须参加。',
      '主持人：同意。请李明在周五前给出投放排期，王芳下周一把展会名单发群里。',
      '李明：另外建议预留 3 万元做素材测试。',
      '主持人：可以，最终预算控制在本季度 45 万元以内。',
    ].join('\n'),
    participantIds: [adminMember.id, employeeMember.id],
  },
})
check('会议纪要模型总结', summarize.status === 200 && Array.isArray(summarize.json?.summary) && summarize.json.summary.length > 0, `${summarize.json?.summary?.length ?? 0} 条要点`)
check('会议纪要提取待办', Array.isArray(summarize.json?.actions) && summarize.json.actions.length > 0, `${summarize.json?.actions?.length ?? 0} 条待办`)
const meetingId = `mt_e2e_${stamp}`
const meetingState = (await employee.call('/api/state')).json?.state
const saveMeeting = await employee.call('/api/state', {
  method: 'PUT',
  body: {
    state: {
    ...meetingState,
    meetings: [
      {
        id: meetingId,
        title: 'Q4 市场预算评审',
        date: new Date().toISOString().slice(0, 10),
        durationMin: 20,
        participantIds: [adminMember.id, employeeMember.id],
        createdBy: employeeMember.id,
        source: 'upload',
        audioName: '预算评审.m4a',
        transcript: '主持人：今天确认 Q4 市场预算和渠道排期。',
        summary: summarize.json?.summary ?? [],
        decisions: summarize.json?.decisions ?? [],
        actions: summarize.json?.actions ?? [],
        createdAt: new Date().toISOString(),
      },
    ],
    },
  },
})
const savedMeeting = (saveMeeting.json?.state?.meetings ?? saveMeeting.json?.meetings ?? []).find((item) => item.id === meetingId)
check('会议纪要保存到公司状态', Boolean(savedMeeting), `actions=${savedMeeting?.actions?.length}`)

// 10. 录音上传路径（本地无 Python 时应给出明确错误，而不是假装成功）
const wav = Buffer.alloc(44 + 1600)
wav.write('RIFF', 0)
wav.writeUInt32LE(wav.length - 8, 4)
wav.write('WAVE', 8)
wav.write('fmt ', 12)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(8000, 24)
wav.writeUInt32LE(8000, 28)
wav.writeUInt16LE(1, 32)
wav.writeUInt16LE(8, 34)
wav.write('data', 36)
wav.writeUInt32LE(1600, 40)
const audioUpload = await employee.call('/api/files?purpose=audio&name=' + encodeURIComponent('测试录音.wav'), {
  method: 'POST',
  raw: wav,
  headers: { 'content-type': 'audio/wav' },
})
check('上传录音文件', audioUpload.status === 201 && audioUpload.json?.file?.id, audioUpload.json?.file?.kind)
const transcribe = await employee.call(`/api/files/${audioUpload.json?.file?.id}/transcribe`, { method: 'POST' })
if (transcribe.status === 200) {
  check('录音转写', Boolean(transcribe.json?.text), `text=${String(transcribe.json?.text).slice(0, 40)}`)
} else {
  const reason = transcribe.json?.error ?? transcribe.text
  const honest = /语音转写失败|Python|python|No such file/i.test(reason)
  check('录音转写失败时返回真实错误', honest, reason)
  console.log('NOTE  本机没有部署 Python/Whisper；转写需在容器镜像内验证（Dockerfile 已烘焙依赖与模型）。')
}

// 11. 渠道真实投递（https://httpbin.org/post 回显请求）
const connectorConfig = await admin.call('/api/connectors/c_webhook', {
  method: 'PUT',
  body: {
    endpoint: 'https://httpbin.org/post',
    secret: 'e2e-signing-secret',
    status: 'connected',
    signature: true,
  },
})
check('配置渠道投递地址', connectorConfig.status === 200, connectorConfig.json?.connector?.endpointHint ?? connectorConfig.text.slice(0, 160))
const connectorTest = await admin.call('/api/connectors/c_webhook/test', { method: 'POST' })
check(
  '渠道真实出站投递',
  connectorTest.status === 200 && connectorTest.json?.delivery?.status > 0,
  `ok=${connectorTest.json?.ok} status=${connectorTest.json?.delivery?.status} ${connectorTest.json?.delivery?.latencyMs}ms ${connectorTest.json?.delivery?.message}`,
)
const lastTest = connectorTest.json?.state?.connectors?.find((item) => item.id === 'c_webhook')?.lastTest
check('渠道保存最近一次测试结果', Boolean(lastTest), JSON.stringify(lastTest))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 2)
