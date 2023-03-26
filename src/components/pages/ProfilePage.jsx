import { useState } from 'react'
import { Form, Button } from 'react-bootstrap'
import { Navigate, useOutletContext } from 'react-router-dom'

export default function ProfilePage(props) {
    const [_, setLogged] = useOutletContext()
    const [user, setUser] = useState({})
    const [errorMessage, setErrorMessage] = useState('')
    const [redirect, setRedirect] = useState(false)

    window.clearAllIntervals()

    fetch(props.globalData.getApiUri('profile'), { method: 'GET', credentials: 'include' })
        .then(response => response.json())
        .then(response => {
            setUser(response.data.user)
            props.globalData.updateSessionData(response)
        })

    let deleteAccount = async e => {
        e.preventDefault()
        if (window.confirm('Are you sure you want to delete your account?')) {
            fetch(props.globalData.getApiUri('profileDelete'), {
                method: 'POST', 
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    _csrf: props.csrfToken,
                }),
            })
                .then(response => response.json())
                .then(response => {
                    if (response.success) {
                        props.globalData.logout()
                        setLogged(false)
                        setRedirect(true)
                    }
                    else {
                        setErrorMessage(response.errorMessage)
                    }
                })
        }
    }

    return (
        <div>
            <h1 className='mb-3'>Profile</h1>
            <h4>Nick: {user?.nick}</h4>
            <h4>Email: {user?.nick}</h4>
            <Form onSubmit={deleteAccount}>
                <Button variant='danger' type='submit'>Delete account</Button>
                {errorMessage ? <small className='text-danger'>{errorMessage}</small> : ''}
            </Form>
            {redirect ? <Navigate to={props.globalData.routes['login']} replace /> : ''}
        </div>
    )
}
