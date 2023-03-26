const express = require('express')
const session = require('express-session')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const crypto = require('crypto')
const pgp = require('pg-promise')()
const bcrypt = require('bcrypt')
const csrf = require('csurf')
require('dotenv').config()
const app = express()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const path = require('path')
const handlebars = require('handlebars')
const { engine } = require('express-handlebars')
const http = require('http').Server(app)
const ws = require('express-ws')(app)
const cookieSession = require('cookie-session')
const { v4: uuidv4 } = require('uuid')
const { body, validationResult } = require('express-validator')

dbConfig = {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
}

const db = pgp(dbConfig)

const sessionInstance = session({
    // genid: req => crypto.randomUUID(),
    maxAge: process.env.SESSION_LIFETIME_IN_MILLIS,
    secret: 'secret',
    sameSite: 'none',
    secure: true,
    rolling: true,
    saveUninitialized: true,
    resave: true,
})

app.disable('X-Powered-By')
app.set('trust proxy', 1)

app.use(cors({
    origin: 'http://localhost:5005',
    credentials: true,
}))

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Credentials', true)
    res.header('Access-Control-Allow-Origin', 'http://localhost:5005')
    res.header('Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-HTTP-Method-Override, Set-Cookie, Cookie')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
    next()
})

app.use(cookieParser())

app.use(sessionInstance)

app.use(express.json())

let csrfProtection = csrf({ cookie: true })

app.engine('html', engine())
app.set('view engine', 'html')
app.set('views', './build')


const getNewSessionLifetime = () => (new Date()).getTime() + process.env.SESSION_LIFETIME_IN_MILLIS - 5000

const getSessionExpiry = req => req.session.userId ? getNewSessionLifetime() : null

const wrapSuccessResponse = (req, data = {}) => ({
    success: true,
    sessionExpiry: getSessionExpiry(req),
    data: data,
})

const wrapFailureResponse = (req, message) => {
    let response = {
        success: false,
        sessionExpiry: getSessionExpiry(req),
    }
    // Array of errors
    if (message !== null && message !== null && (message.constructor === Array || message.constructor === Object)) {
        response['errors'] = message
    }
    else {
        response['errorMessage'] = message
    }

    return response
}


const isset = v => v !== undefined && v !== null

const empty = v => v === undefined || v === null || v === 0 || v === '' || (Array.isArray(v) && v.length === 0)

class Clients {
    unassignedSockets = []
    sockets = []
    sessions = []

    initSocket(socket) {
        socket.id = uuidv4()
        this.unassignedSockets[socket.id] = socket
    }

    assignSocket(socket, userId) {
        this.sockets[userId] = this.unassignedSockets[socket.id]
    }

    deleteSocket(userId) {
        if (userId !== undefined) {
            delete this.sockets[userId]
        }
    }

    getSocketsForUsers(userIds) {
        let result = []
        for (let uid of userIds) {
            if (this.sockets[uid] !== undefined && this.sockets[uid] !== null) {
                result.push(this.sockets[uid])
            }
        }
        return result
    }

    onRequest(userId) {
        this.sessions[userId] = getNewSessionLifetime()
    }

    setUserSession(userId, sessionExpiry) {
        this.sessions[userId] = sessionExpiry
    }

    logout(userId) {
        delete this.sockets[userId]
        delete this.sessions[userId]
    }

    isLogged(userId) {
        console.log(`Session: ${this.sessions[userId]}`)
        console.log(`Socket: ${this.sockets[userId]?.id}`)
        return this.sessions[userId] !== undefined 
            && this.sessions[userId] !== null
            && this.sessions[userId] >= (new Date()).getTime() 
    }
}


let clients = new Clients()

let wss = ws.getWss()

wss.on('connection', (s, req) => {
    clients.initSocket(s)
})

wss.on('close', (s, req) => {
    clients.deleteSocket(req.session?.userId)
})

app.use('*', (req, res, next) => {
    if (req.session.userId !== undefined) {
        clients.onRequest(req.session.userId)
    }
    next()
})

app.ws('/api/chat', (s, req) => {
    let userId = req.session.userId
    if (userId === undefined) {
        return
    }

    clients.assignSocket(s, userId)

    s.on('message', async msg => {
        let sendData = JSON.parse(msg)
        if (empty(sendData) || empty(sendData.roomId) || empty(sendData.message)) {
            s.send(JSON.stringify(wrapFailureResponse(req, 'Missing required params.')))
            return
        }

        let message = (await db.any(
            'INSERT INTO message (content, user_id, room_id) VALUES($1, $2, $3) RETURNING *', 
            [sendData.message, userId, sendData.roomId]
        ))
        if (message[0] === undefined) {
            s.send(JSON.stringify(wrapFailureResponse(req, 'Something has gone wrong.')))
            return
        }
        message = message[0]

        let roomUsers = (await db.any(
            'SELECT u.* FROM "user" u LEFT JOIN user_room ur ON ur.user_id = u.id WHERE ur.room_id = $1', 
            sendData.roomId
        ))

        let roomUserIds = roomUsers.map(ru => ru.id)

        if (roomUserIds.length > 1) {
            // Set message as not seen by other users, later from the frontend they'll be updated as seen
            let query = 'INSERT INTO user_room_message_not_seen (user_id, room_id, message_id) VALUES'
            let bindings = []
            let i = 0
            for (let uid of roomUserIds) {
                if (uid === userId) {
                    continue
                }
                query += `($${i*3+1}, $${i*3+2}, $${i*3+3}),`
                bindings.push(uid)
                bindings.push(sendData.roomId)
                bindings.push(message.id)
                i++
            }
            query = query.substring(0, query.length - 1)
            await db.query(query, bindings)
        }

        for (let user of roomUsers) {
            if (user.id === message.user_id) {
                message.nick = user.nick
            }
        }

        clients.getSocketsForUsers(roomUserIds).forEach(c => {
            if (c.readyState === 1) {
                c.send(JSON.stringify(wrapSuccessResponse(req, { message: message })))
            }
        })
    })

    s.on('close', (s, req) => {
        clients.deleteSocket(req.session?.userId)
    })
})

app.post(
    '/api/registration', 
    csrfProtection,
    body('nick')
        .exists().trim().notEmpty().withMessage('Username is required.')
        .isLength({ min: 3, max: 50 }).withMessage('Username must be 3 to 50 characters long.')
        .matches('^[0-9a-zA-Z\-_\. ]+$').withMessage('Username may contain only letters, numbers, dashes, underscores, dotes and spaces.'),
    body('email')
        .exists().trim().notEmpty().withMessage('Email address is required.')
        .isLength({ min: 5, max: 150 }).isEmail().withMessage('This is not a proper email address.'),
    body('password')
        .exists().trim().notEmpty().withMessage('Password is required.')
        .isLength({ min: 12, max: 50 }).withMessage('Password must be 12 to 50 characters long.')
        .matches('^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{12,50}$')
        .withMessage('Password must contain letters, numbers and special characters.')
        .custom((value, { req }) => value === req.body.repeatPassword).withMessage('Both passwords must match.'),
    async (req, res) => {
        let errors = validationResult(req)
        if (errors.mapped().nick === undefined || errors.mapped().email === undefined) {
            let user = (await db.any('SELECT id, nick, email FROM "user" WHERE nick = $1 OR email = $2', [req.body.nick, req.body.email]))[0]
            if (user !== undefined && user.nick === req.body.nick) {
                errors.errors.push({ value: req.body.nick, param: 'nick', msg: 'Nick is already taken. Please choose another.', location: 'body' })
            }
            if (user !== undefined && user.email === req.body.email) {
                errors.errors.push({ value: req.body.email, param: 'email', msg: 'Email is already taken. Please choose another.', location: 'body' })
            }
        }

        if (errors.isEmpty()) {
            let hashedPassword = await bcrypt.hash(req.body.password, 10)
            await db.query('INSERT INTO "user" (nick, email, password) VALUES($1, $2, $3)', [req.body.nick, req.body.email, hashedPassword])

            res.setHeader('Content-Type', 'application/json')
            res.send(wrapSuccessResponse(req, {}))
        }
        else {
            res.setHeader('Content-Type', 'application/json')
            res.send(wrapFailureResponse(req, errors.mapped()))
        }
    }
)

app.post('/api/login', csrfProtection, async (req, res) => {
    let user = await prisma.user.findUnique({ where: { email: req.body?.email } })
    if (user) {
        let rightPassword = await bcrypt.compare(req.body?.password, user.password)
        if (rightPassword) {
            req.session.userId = user.id
            req.session.save()
            delete user.password

            res.setHeader('Content-Type', 'application/json')
            res.send(wrapSuccessResponse(req, { loggedUser: user }))
            return
        }
    }
    await prisma.$disconnect()

    res.setHeader('Content-Type', 'application/json')
    res.send(wrapFailureResponse(req, 'Wrong login or password.'))
})

app.post('/api/logout', (req, res) => {
    if (isset(req.session.userId)) {
        clients.logout(req.session.userId)
        delete req.session.userId

        res.setHeader('Content-Type', 'application/json')
        res.send(wrapSuccessResponse(req, {}))
        return
    }

    res.setHeader('Content-Type', 'application/json')
    res.send(wrapFailureResponse(req, 'Forbidden.'))
})

app.get('/api/profile', async (req, res) => {
    let currentUserId = req.session?.userId
    if (!isset(currentUserId)) {
        res.setHeader('Content-Type', 'application/json')
        res.send(wrapFailureResponse(req, 'Must login.'))
        return
    }
    let user = (await db.any('SELECT * FROM "user" WHERE id = $1', req.session.userId))[0]

    res.setHeader('Content-Type', 'application/json')
    res.send(wrapSuccessResponse(req, { user: user }))
})

app.post('/api/profile/delete', csrfProtection, async (req, res) => {
    let currentUserId = req.session?.userId
    if (!isset(currentUserId)) {
        res.setHeader('Content-Type', 'application/json')
        res.send(wrapFailureResponse(req, 'Must login.'))
        return
    }
    
    await db.query('DELETE FROM "user" WHERE id = $1', req.session.userId)
    clients.logout(req.session.userId)
    delete req.session.userId

    res.setHeader('Content-Type', 'application/json')
    res.send(wrapSuccessResponse(req, {}))
})

app.get('/api/users', async (req, res) => {
    let users = (await prisma.user.findMany())
    for (let i in users) {
        delete users[i].email
        delete users[i].password
        users[i].is_logged = clients.isLogged(users[i].id)
    }
    prisma.$disconnect()

    res.setHeader('Content-Type', 'application/json')
    res.send(wrapSuccessResponse(req, { users: users }))
})

app.get('/api/rooms', async (req, res) => {
    let currentUserId = req.session?.userId
    if (!isset(currentUserId)) {
        res.setHeader('Content-Type', 'application/json')
        res.send(wrapFailureResponse(req, 'Must login.'))
        return
    }
    let secondUserId = parseInt(req.query?.user_id)
    if (!isset(secondUserId)) {
        res.setHeader('Content-Type', 'application/json')
        res.send(wrapFailureResponse(req, 'Missing second user.'))
        return
    }

    let room
    if (currentUserId === secondUserId) {
        room = (await db.any(`
            (SELECT room_id FROM user_room WHERE user_id = $1) 
            INTERSECT (
                SELECT r.id 
                FROM room r 
                LEFT JOIN user_room ur ON ur.room_id = r.id 
                GROUP BY r.id 
                HAVING COUNT(ur.id) = 1
            )`, 
            currentUserId
        ))
    }
    else {
        room = (await db.any(`
            (SELECT room_id FROM user_room WHERE user_id = $1) 
            INTERSECT (SELECT room_id FROM user_room WHERE user_id = $2) 
            INTERSECT (
                SELECT r.id 
                FROM room r 
                LEFT JOIN user_room ur ON ur.room_id = r.id 
                GROUP BY r.id 
                HAVING COUNT(ur.id) = 2
            )`, [
                currentUserId,
                secondUserId,
            ]
        ))
    }

    let roomId
    let messages
    if (empty(room)) {
        roomId = (await db.any('INSERT INTO room (id) VALUES(DEFAULT) RETURNING *'))[0].id
        messages = []

        if (currentUserId === secondUserId) {
            await db.any('INSERT INTO user_room (user_id, room_id) VALUES($1, $2)', [currentUserId, roomId])
        }
        else {
            await db.any('INSERT INTO user_room (user_id, room_id) VALUES($1, $2), ($3, $4)', [currentUserId, roomId, secondUserId, roomId])
        }
    }
    else {
        roomId = room[0].room_id
        messages = (await db.any(`
            SELECT *
            FROM (SELECT m.*, u.nick
                FROM message m 
                LEFT JOIN "user" u ON u.id = m.user_id
                LEFT JOIN user_room_message_not_seen urms ON urms.message_id = m.id
                WHERE m.room_id = $1
                ORDER BY m.created_at DESC 
                LIMIT 50
            ) AS t
            ORDER BY t.created_at ASC`, 
            roomId
        ))
    }

    let roomUsers = (await db.any(`
        SELECT u.*
        FROM "user" u 
        LEFT JOIN user_room ur ON ur.user_id = u.id
        WHERE ur.room_id = $1`, 
        roomId
    ))

    res.setHeader('Content-Type', 'application/json')
    res.send(wrapSuccessResponse(req, {
        roomId: roomId,
        messages: messages,
        roomUsers: roomUsers,
    }))
})

app.get('/api/rooms/:roomId', async (req, res) => {
    let roomId = req.params.roomId
    let messages = (await db.any(`
        SELECT *
        FROM (SELECT m.*, u.nick
            FROM message m 
            LEFT JOIN "user" u ON u.id = m.user_id
            LEFT JOIN user_room_message_not_seen urms ON urms.message_id = m.id
            WHERE m.room_id = $1
            ORDER BY m.created_at DESC 
            LIMIT 50
        ) AS t
        ORDER BY t.created_at ASC`, 
        roomId
    ))

    let roomUsers = (await db.any(`
        SELECT u.*
        FROM "user" u 
        LEFT JOIN user_room ur ON ur.user_id = u.id
        WHERE ur.room_id = $1`, 
        roomId
    ))

    res.setHeader('Content-Type', 'application/json')
    res.send(wrapSuccessResponse(req, {
        roomId: roomId,
        messages: messages,
        roomUsers: roomUsers,
    }))
})

app.post('/api/rooms/:roomId/messages/see', async (req, res) => {
    let userId = req.session.userId
    if (userId === undefined) {
        res.setHeader('Content-Type', 'application/json')
        res.send(JSON.stringify(wrapFailureResponse(req, 'Login required.')))
        return
    }
    
    await db.query('DELETE FROM user_room_message_not_seen WHERE user_id = $1 AND room_id = $2', [userId, req.params.roomId])

    res.setHeader('Content-Type', 'application/json')
    res.send(JSON.stringify(wrapSuccessResponse(req, {})))
})

app.get('/api/rooms/messages/unseen', async (req, res) => {
    let userId = req.session.userId
    if (userId === undefined) {
        res.send(JSON.stringify(wrapFailureResponse(req, 'Login required.')))
        return
    }
    
    let messages = (await db.any(`
        SELECT m.*, u.nick 
        FROM user_room_message_not_seen urmns 
        LEFT JOIN message m ON m.id = urmns.message_id 
        LEFT JOIN "user" u ON u.id = m.user_id 
        WHERE urmns.user_id = $1
        ORDER BY urmns.room_id`, 
        userId
    ))

    res.setHeader('Content-Type', 'application/json')
    res.send(JSON.stringify(wrapSuccessResponse(req, { messages: messages })))
})

app.use('*', csrfProtection, (req, res) => {
    if (req.originalUrl.endsWith('.js') || req.originalUrl.endsWith('.css')) {
        res.sendFile(`${process.env.ROOT_DIR}/build${req.originalUrl}`)
    }
    else {
        res.render('index', {
            layout: false, 
            csrfToken: req.csrfToken(),
        })
    }
})

app.listen(process.env.PORT, () => {
    console.log(`Server listening on port ${process.env.PORT}`)
})
