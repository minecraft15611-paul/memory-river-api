require('dotenv').config()
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')

const app = express()
app.use(cors())
app.use(express.json())

// ===== MongoDB 連線 =====
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB 連線成功'))
  .catch(err => console.error('MongoDB 連線失敗', err))

// ===== Course Schema =====
const courseSchema = new mongoose.Schema({
  title:     { type: String, required: true },
  date:      { type: String },
  dateValue: { type: String },
  time:      { type: String },
  rest:      { type: String },
  location:  { type: String },
  summary:   { type: String },
  blocks:    [
    {
      title: String,
      items: [String]
    }
  ],
  createdAt: { type: Date, default: Date.now }
})

const Course = mongoose.model('Course', courseSchema)

// ===== JWT 驗證 =====
function verifyToken(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未授權' })
  }
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET)
    req.admin = decoded
    next()
  } catch {
    res.status(401).json({ success: false, message: 'token 無效或已過期' })
  }
}

// ===== 聯絡表單 API =====
app.post('/api/contact', async (req, res) => {
  const { name, contact, topic, time } = req.body

  if (!name || !contact) {
    return res.status(400).json({ success: false, message: '請填寫姓名與聯絡方式' })
  }

  const lineMessage = `
📩 新預約通知
姓名：${name}
聯絡方式：${contact}
諮詢主題：${topic || '未填寫'}
方便時段：${time || '未填寫'}
  `.trim()

  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: process.env.LINE_USER_ID,
        messages: [{ type: 'text', text: lineMessage }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    )
    res.json({ success: true, message: '訊息已送出' })
  } catch (error) {
    console.error(error.response?.data || error.message)
    res.status(500).json({ success: false, message: '傳送失敗' })
  }
})

// ===== 前台 API =====
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await Course.find().sort({ dateValue: 1 })
    res.json({ success: true, courses })
  } catch {
    res.status(500).json({ success: false, message: '讀取失敗' })
  }
})

// ===== 後台 API =====
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: '密碼錯誤' })
  }
  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '7d' })
  res.json({ success: true, token })
})

app.get('/api/admin/courses', verifyToken, async (req, res) => {
  try {
    const courses = await Course.find().sort({ dateValue: 1 })
    res.json({ success: true, courses })
  } catch {
    res.status(500).json({ success: false, message: '讀取失敗' })
  }
})

app.post('/api/admin/courses', verifyToken, async (req, res) => {
  try {
    const course = new Course(req.body)
    await course.save()
    res.json({ success: true, course })
  } catch {
    res.status(500).json({ success: false, message: '新增失敗' })
  }
})

app.put('/api/admin/courses/:id', verifyToken, async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
    if (!course) return res.status(404).json({ success: false, message: '找不到此課程' })
    res.json({ success: true, course })
  } catch {
    res.status(500).json({ success: false, message: '更新失敗' })
  }
})

app.delete('/api/admin/courses/:id', verifyToken, async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id)
    if (!course) return res.status(404).json({ success: false, message: '找不到此課程' })
    res.json({ success: true })
  } catch {
    res.status(500).json({ success: false, message: '刪除失敗' })
  }
})

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ success: false, message: '找不到此路由' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})