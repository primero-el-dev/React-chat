import React from 'react'
import { Link } from 'react-router-dom'
import { Row, Col, Card, Form, Button, Tabs, Tab, Badge } from 'react-bootstrap'

const ALL_USERS_VIEW = 'all_users'
const INBOX_VIEW = 'inbox'

export default class HomePage extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            users: [],
            message: '',
            roomId: null,
            messages: [],
            roomUsers: [],
            otherRoomUnreads: [],
            view: ALL_USERS_VIEW,
            searchUsers: '',
        }
        this.socket = new WebSocket(this.props.globalData.websockeUri)
        this.socket.addEventListener('error', m => console.log('error'))
        this.socket.addEventListener('open', m => console.log('websocket connection open'))
        this.socket.addEventListener('message', async m => {
            if (m.data === 'undefined' || m.data === undefined) {
                console.error('Received message is undefined.')
                return
            }
            let message = JSON.parse(m.data).data.message
            
            if (message.room_id == this.state.roomId) {
                this.setState({ messages: [...this.state.messages, JSON.parse(m.data).data.message] })
                await this.seeMessagesFromRoom(this.state.roomId)
            }
            else {
                let unreads = this.state.otherRoomUnreads
                if (unreads[message.room_id] === undefined) {
                    unreads[message.room_id] = []
                }
                unreads[message.room_id].push(message)
                this.setState({ otherRoomUnreads: unreads })
            }
            this.props.globalData.updateSessionData(JSON.parse(m.data))
            this.forceUpdate()
        })
    }

    componentDidMount() {
        this.updateUsersData()
        window.clearAllIntervals()
        window.setCustomInterval(() => {
            this.updateUsersData()
        }, 20000)
        
        fetch(this.props.globalData.getApiUri('roomsMessagesUnseen'), { method: 'GET', credentials: 'include' })
            .then(response => response.json())
            .then(response => {
                this.props.globalData.updateSessionData(response)
                let unreads = this.state.otherRoomUnreads
                for (let message of response.data.messages) {
                    if (unreads[message.room_id] === undefined) {
                        unreads[message.room_id] = []
                    }
                    let add = true
                    for (let msg of unreads[message.room_id]) {
                        if (msg.id === message.id) {
                            add = false
                        }
                    }
                    if (add) {
                        unreads[message.room_id].push(message)
                    }
                }
                this.setState({ otherRoomUnreads: unreads })
                this.props.globalData.updateSessionData(response)
            })
    }

    updateUsersData() {
        fetch(this.props.globalData.getApiUri('usersGet'), { method: 'GET', credentials: 'include' })
            .then(response => response.json())
            .then(response => {
                this.props.globalData.updateSessionData(response)
                this.setState({ users: response.data.users })
                this.props.globalData.updateSessionData(response)
                this.forceUpdate()
            })
    }

    componentDidUpdate() {
        this.messagesEnd.scrollIntoView({ behavior: 'smooth' })
    }

    seeMessagesFromRoom = async roomId => {
        await fetch(this.props.globalData.getApiUri('roomsMessagesSee', [roomId]), { method: 'POST', credentials: 'include' })
    }

    handleSubmit = instance => async e => {
        e.preventDefault()
        
        this.send({
            message: this.state.message,
            roomId: this.state.roomId,
        })

        this.setState({ message: '' })
    }

    send = (message, callback) => {
        this.waitForConnection(() => {
            this.socket.send(JSON.stringify(message))
            if (callback !== undefined) {
                callback()
            }
        }, 1000)
    }

    waitForConnection = (callback, interval) => {
        if (this.socket.readyState === 1) {
            callback()
        } else {
            var that = this
            interval = 1000
            setTimeout(() => {
                that.waitForConnection(callback, interval)
            }, interval)
        }
    }

    changeRoomByUser = (instance, userId) => async e => {
        await this.changeRoom(this.props.globalData.getApiUri('roomsGet', [], { user_id: userId, private: true }))
    }

    changeRoomById = (instance, roomId) => async e => {
        await this.changeRoom(this.props.globalData.getApiUri('roomGet', [roomId]))
    }

    changeRoom = async uri => {
        await fetch(uri, { method: 'GET', credentials: 'include' })
            .then(response => response.json())
            .then(async response => {
                this.setState({
                    roomId: response.data.roomId,
                    messages: response.data.messages,
                    roomUsers: response.data.roomUsers,
                })

                let unreads = this.state.otherRoomUnreads
                delete unreads[response.data.roomId]
                this.setState({ otherRoomUnreads: unreads })
                
                await this.seeMessagesFromRoom(response.data.roomId)

                this.props.globalData.updateSessionData(response)
            })
    }

    getRoomUser = id => {
        for (let user of this.state.roomUsers) {
            if (user.id === id) {
                return user
            }
        }
        return null
    }

    addTrailingZero = value => (value < 10) ? ('0' + value) : value

    displayDateString = dateString => {
        let date = new Date(dateString)
        let month = this.addTrailingZero(date.getMonth() + 1)
        let minutes = this.addTrailingZero(date.getMinutes())
        let days = this.addTrailingZero(date.getDate())
        let hours = this.addTrailingZero(date.getHours())

        return `${hours}:${minutes}, ${days}.${month}`
    }

    displayLeftSide = () => {
        switch (this.state.view) {
            case ALL_USERS_VIEW: return this.displayAllUsers()
            case INBOX_VIEW: return this.displayInbox()
            default: return this.displayAllUsers()
        }
    }

    displayAllUsers = () => {
        return this.state.users
            .filter(u => this.state.searchUsers === '' || u.nick.toLowerCase().includes(this.state.searchUsers.toLowerCase()))
            .map(user => (
                <Card key={user.id} className="mb-2">
                    <Card.Body>
                        <Link className='d-block w-100 text-decoration-none color-primary' onClick={this.changeRoomByUser(this, user.id)}>
                            {user.nick} {user.is_logged ? <small className='float-right'>🟢</small> : ''}
                        </Link>
                    </Card.Body>
                </Card>
            ))
    }

    displayInbox = () => {
        let result = []
        for (let unreadRoomId in this.state.otherRoomUnreads) {
            let messages = this.state.otherRoomUnreads[unreadRoomId]
            let lastMessage = messages[messages.length - 1]
            
            result.push(
                <Card key={lastMessage.room_id} className="mb-2">
                    <Card.Body>
                        <Link className='d-block w-100 text-decoration-none color-primary' onClick={this.changeRoomById(this, lastMessage.room_id)}>
                            {lastMessage.nick} 
                            <Badge bg="primary" className='ml-auto float-right'>{this.state.otherRoomUnreads[unreadRoomId].length}</Badge>
                        </Link>
                    </Card.Body>
                </Card>
            )
        }

        if (result.length === 0) {
            result = <div class='w-100 text-center color-secondary mt-4'>No messages found</div>
        }

        return result
    }

    render() {
        return (
            <>
                <Row>
                    <Col sm={4} className='mb-4'>
                        <Tabs className='mb-3' onSelect={k => this.setState({ view: k })}>
                            <Tab title='All users' eventKey={ALL_USERS_VIEW} />
                            <Tab title={`Inbox ${this.state.otherRoomUnreads.filter(i => i).length ? '*' : ''}`} eventKey={INBOX_VIEW} />
                        </Tabs>
                        {this.state.view === ALL_USERS_VIEW
                            ? <Form.Group className='mb-3'>
                                <Form.Control 
                                    type='text' 
                                    value={this.state.searchUsers} 
                                    placeholder='Search users...' 
                                    onChange={e => this.setState({ searchUsers: e.target.value })} />
                            </Form.Group>
                            : ''
                        }
                        <div style={{ height: '20rem', overflow: 'auto' }}>
                            {this.displayLeftSide()}
                        </div>
                    </Col>
                    <Col sm={8}>
                        <div id="chatWindow" className="mb-3 border rounded overflow-auto w-100" style={{ height: '20rem' }}>
                            {this.state.roomId === null 
                                ? '<- Select room first'
                                : ''
                            }
                            {this.state.messages.map(m => {
                                let loggedUser = this.props.globalData.getLoggedUser()
                                if (!loggedUser) {
                                    return ''
                                }
                                let byMe = m.user_id === loggedUser.id
                                let additionalClasses = byMe ? 'bg-gray mr-2-i ml-auto-i' : 'bg-primary mx-2'
                                let caption = `By ${byMe ? 'me' : this.getRoomUser(m.user_id).nick} at ${this.displayDateString(m.created_at)}`
                                return (
                                    <div key={m.id} className={`text-light rounded my-2 p-2 w-75 ${additionalClasses}`} title={caption}>
                                        {m.content}
                                    </div>
                                )
                            })}
                            <div style={{ float:"left", clear: "both" }} ref={(el) => { this.messagesEnd = el; }}></div>
                        </div>
                        <Form onSubmit={this.handleSubmit(this)}>
                            <Form.Group className='mb-3' controlId="exampleForm.ControlTextarea1">
                                <Form.Control 
                                    type='text' 
                                    placeholder='Write message...' 
                                    name='message' 
                                    onChange={e => this.setState({ message: e.target.value })}
                                    value={this.state.message}
                                    required />
                            </Form.Group>
                            <Button type='submit' variant='primary' className='btn-block w-100' disabled={this.state.roomId === null}>Send</Button>
                        </Form>
                    </Col>
                </Row>
            </>
        )
    }
}
