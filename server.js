require('dotenv').config()
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json())

const COURSES_PATH = path.join(__dirname, 'courses.json')

// ===== 工具函式 =====
function readCourses() {
  const raw = fs.readFileSync(COURSES_PATH, 'utf-8')
  return JSON.parse(raw).courses
}

function writeCourses(courses) {
  fs.writeFileSync(COURSES_PATH, JSON.stringify({ courses }, null, 2))
}

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

// ===== 聯絡表單 API(現有) =====
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
app.get('/api/courses', (req, res) => {
  try {
    const courses = readCourses()
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

app.get('/api/admin/courses', verifyToken, (req, res) => {
  try {
    const courses = readCourses()
    res.json({ success: true, courses })
  } catch {
    res.status(500).json({ success: false, message: '讀取失敗' })
  }
})

app.post('/api/admin/courses', verifyToken, (req, res) => {
  try {
    const courses = readCourses()
    const newCourse = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString()
    }
    courses.push(newCourse)
    writeCourses(courses)
    res.json({ success: true, course: newCourse })
  } catch {
    res.status(500).json({ success: false, message: '新增失敗' })
  }
})

app.put('/api/admin/courses/:id', verifyToken, (req, res) => {
  try {
    const courses = readCourses()
    const index = courses.findIndex(c => c.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ success: false, message: '找不到此課程' })
    }
    courses[index] = { ...courses[index], ...req.body }
    writeCourses(courses)
    res.json({ success: true, course: courses[index] })
  } catch {
    res.status(500).json({ success: false, message: '更新失敗' })
  }
})

app.delete('/api/admin/courses/:id', verifyToken, (req, res) => {
  try {
    const courses = readCourses()
    const filtered = courses.filter(c => c.id !== req.params.id)
    if (filtered.length === courses.length) {
      return res.status(404).json({ success: false, message: '找不到此課程' })
    }
    writeCourses(filtered)
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