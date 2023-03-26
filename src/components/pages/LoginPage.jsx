import React, { useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { Form, Button } from 'react-bootstrap'

export default function LoginPage(props) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [errorMessage, setErrorMessage] = useState('')
    const [redirect, setRedirect] = useState(false)
    const [_, setLogged] = useOutletContext()

    window.clearAllIntervals()

    let handleSubmit = async e => {
        e.preventDefault()
        let response = await fetch(props.globalData.getApiUri('login'), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                password: password,
                _csrf: props.csrfToken,
            }),
        })
            .then(data => data.json())

        if (response.success) {
            props.globalData.updateSessionData(response)
            props.globalData.setLoggedUser(response.data.loggedUser)
            setLogged(true)
            setRedirect(true)
        }
        else {
            setErrorMessage(response.errorMessage)
        }
    }

    return (
        <div>
            <h1>Login</h1>
            <Form onSubmit={handleSubmit}>
                <Form.Group className='mb-3' controlId='formEmail'>
                    <Form.Label>Email address</Form.Label>
                    <Form.Control type='email' placeholder='Enter email' onChange={e => setEmail(e.target.value)} />
                </Form.Group>
                <Form.Group className='mb-3' controlId='formPassword'>
                    <Form.Label>Password</Form.Label>
                    <Form.Control type='password' placeholder='Password' onChange={e => setPassword(e.target.value)} />
                </Form.Group>
                <Button variant='primary' type='submit' className='w-100'>
                    Login
                </Button>
                {errorMessage ? <div className='text-danger'>{errorMessage}</div> : ''}
            </Form>
            {redirect ? <Navigate to={props.globalData.routes.home} replace /> : ''}
        </div>
    )
}
