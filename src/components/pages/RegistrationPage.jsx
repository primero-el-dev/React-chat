import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Form, Button } from 'react-bootstrap'

export default function RegistrationPage(props) {
    const [nick, setNick] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [repeatPassword, setRepeatPassword] = useState('')
    const [redirect, setRedirect] = useState(false)
    const [errors, setErrors] = useState([])

    let handleSubmit = async e => {
        e.preventDefault()
        let response = await fetch(props.globalData.getApiUri('registration'), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                nick: nick,
                email: email,
                password: password,
                repeatPassword: repeatPassword,
                _csrf: props.csrfToken,
            }),
        })
            .then(response => response.json())
            .then(response => {
                if (response.success) {
                    setRedirect(true)
                }
                else {
                    setErrors(response.errors)
                }
            })
    }

    return (
        <div>
            <h1>Registration</h1>
            <Form onSubmit={handleSubmit}>
                <Form.Group className='mb-3' controlId='formNick'>
                    <Form.Label>Nick</Form.Label>
                    <Form.Control type='text' placeholder='Enter username' value={nick} onChange={e => setNick(e.target.value)} />
                    {errors['nick'] ? <small className='text-danger'>{errors['nick'].msg}</small> : ''}
                </Form.Group>
                <Form.Group className='mb-3' controlId='formEmail'>
                    <Form.Label>Email address</Form.Label>
                    <Form.Control type='text' placeholder='Enter email' value={email} onChange={e => setEmail(e.target.value)} />
                    {errors['email'] ? <small className='text-danger'>{errors['email'].msg}</small> : ''}
                </Form.Group>
                <Form.Group className='mb-3' controlId='formPassword'>
                    <Form.Label>Password</Form.Label>
                    <Form.Control type='password' placeholder='Password' value={password} onChange={e => setPassword(e.target.value)} />
                    {errors['password'] ? <small className='text-danger'>{errors['password'].msg}</small> : ''}
                </Form.Group>
                <Form.Group className='mb-3' controlId='formRepeatPassword'>
                    <Form.Label>Repeat password</Form.Label>
                    <Form.Control type='password' placeholder='Password' value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)} />
                    {errors['repeatPassword'] ? <small className='text-danger'>{errors['repeatPassword'].msg}</small> : ''}
                </Form.Group>
                <Button variant='primary' type='submit' className='w-100'>
                    Register
                </Button>
            </Form>
            {redirect ? <Navigate to={props.globalData.routes.login} replace /> : ''}
        </div>
    )
}