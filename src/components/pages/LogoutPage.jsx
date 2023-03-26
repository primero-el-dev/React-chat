import { Navigate, useOutletContext } from 'react-router-dom'

export default function LogoutPage(props) {
    const [_, setLogged] = useOutletContext()
    
    fetch(props.globalData.getApiUri('logout'), { method: 'POST', credentials: 'include' }).then(response => {})
    props.globalData.logout()
    setLogged(false)

    return (
        <Navigate to={props.globalData.routes['login']} replace />
    )
}
