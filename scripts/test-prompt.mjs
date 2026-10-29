// 本地验证：绑定了已安装技能的助理，system prompt 里是否带上了 SKILL.md 正文。
// 不需要模型 Key，直接调 prompt 组装函数。
import fs from 'node:fs'
import { agentSystemPrompt } from '../server/chat.mjs'

const root = 'D:\\AI\\tesccc\\TeamOS-live\\.hermes-home\\skills'
const installed = fs.readdirSync(root)
console.log('已安装技能:', installed.join(', '))

const slug = installed.find((item) => fs.existsSync(`${root}\\${item}\\SKILL.md`))
const body = fs.readFileSync(`${root}\\${slug}\\SKILL.md`, 'utf8')
const withoutFrontmatter = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
const marker = withoutFrontmatter
  .split(/\r?\n/)
  .find((line) => line.trim().length > 12 && !line.startsWith('#'))
  ?.trim()
  .slice(0, 12)
console.log('取样技能:', slug, '| 正文取样:', marker)

const state = {
  company: { name: '测试公司' },
  skills: [
    { id: 's1', slug, name: slug, description: '测试技能', status: 'enabled' },
    { id: 's2', slug: 'not-installed', name: '未安装技能', description: '没有正文', status: 'enabled' },
  ],
  members: [{ id: 'u1', name: '张三', jobTitle: '工程师' }],
  sessions: [],
  messages: [],
}
const user = { member_id: 'u1', email: 'a@b.c' }
const agent = {
  name: '小助手',
  title: '工程助理',
  department: '研发',
  description: '帮忙写代码',
  responsibilities: ['交付可运行代码'],
  instructions: '',
  tone: '',
  outOfScope: '',
  escalation: '',
  skills: ['s1', 's2'],
  tools: ['file.read'],
}

const prompt = agentSystemPrompt({ state, user, agent, knowledge: [] })
const checks = [
  ['包含已安装技能正文', marker ? prompt.includes(marker) : false],
  ['包含技能小节标题', prompt.includes(`### 技能：${slug}`)],
  ['未安装技能退回描述', prompt.includes('未安装技能：没有正文')],
  ['保留工具段', prompt.includes('读取工作区文件')],
]
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
console.log('\nprompt 长度:', prompt.length, '字符')
await import('node:fs').then(({ writeFileSync }) => writeFileSync('D:\\AI\\tesccc\\shots\\prompt-sample.txt', prompt))
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
