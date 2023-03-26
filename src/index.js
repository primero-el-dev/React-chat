import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
  Navigate,
} from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import MainLayout from './components/layouts/MainLayout'
import ErrorPage from './components/pages/ErrorPage'
import HomePage from './components/pages/HomePage'
import LoginPage from './components/pages/LoginPage'
import LogoutPage from './components/pages/LogoutPage'
import RegistrationPage from './components/pages/RegistrationPage'
import ProfilePage from './components/pages/ProfilePage'


const globalData = {
    websockeUri: 'ws://localhost:5004/api/chat',
    frontendBaseUri: 'http://localhost:5004',
    backendBaseUri: 'http://localhost:5004',
    apiRoutes: {
        login: '/api/login',
        logout: '/api/logout',
        registration: '/api/registration',
        profile: '/api/profile',
        profileDelete: '/api/profile/delete',
        usersGet: '/api/users',
        roomsGet: '/api/rooms',
        roomGet: '/api/rooms/param_1',
        roomsMessagesSee: '/api/rooms/param_1/messages/see',
        roomsMessagesUnseen: '/api/rooms/messages/unseen',
    },
    routes: {
        home: '/',
        login: '/login',
        logout: '/logout',
        registration: '/registration',
        profile: '/profile',
    },
    getSessionExpiry: () => localStorage.getItem('sessionExpiry', null),
    userIsLogged: () => globalData.getLoggedUser() !== null,
    getLoggedUser: () => {
        if (localStorage.getItem('sessionExpiry', null) >= (new Date()).getTime() * 1000 
            && localStorage.getItem('loggedUser', null) !== null
            && localStorage.getItem('loggedUser', null) !== undefined
            && localStorage.getItem('loggedUser', null) !== 'null'
            && localStorage.getItem('loggedUser', null) !== 'undefined'
        ) {
            return JSON.parse(localStorage.getItem('loggedUser'))
        }
        return null
    },
    setLoggedUser: user => localStorage.setItem('loggedUser', JSON.stringify(user)),
    updateSessionData: response => localStorage.setItem('sessionExpiry', response.sessionExpiry),
    getApiUri: (route, tokens = [], queryParams = []) => {
        let requestUri = globalData.apiRoutes[route]
        if (requestUri === undefined || requestUri === null) {
            throw Error(`Route '${route}' is not defined`)
        }
        for (let i in tokens) {
            requestUri = requestUri.replace(`param_${parseInt(i)+1}`, tokens[i])
        }
        let params = []
        for (let key in queryParams) {
            params.push(key + '=' + queryParams[key])
        }
        return globalData.backendBaseUri + requestUri + ((params.length > 0) ? ('?' + params.join('&')) : '')
    },
    getFrontendUri: route => globalData.frontendBaseUri + globalData.routes[route],
    logout: () => {
        localStorage.removeItem('sessionExpiry')
        localStorage.removeItem('loggedUser')
    }
}

let intervals = []
window.setCustomInterval = (func, delay) => {
    intervals.push(setInterval(func, delay))
}

window.clearAllIntervals = () => {
    for (let interval of intervals) {
        clearInterval(interval)
    }
    intervals = []
}


const ProtectedRoute = ({ children }) => {
    if (!globalData.userIsLogged()) {
        return <Navigate to={globalData.routes.login} replace />
    }

    return children;
}

const AnonymousRoute = ({ children }) => {
    if (globalData.userIsLogged()) {
        return <Navigate to={globalData.routes.home} replace />
    }

    return children;
}

const csrfToken = document.getElementById('csrf_token').value

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            element={<MainLayout globalData={globalData} />}
            errorElement={<ErrorPage />}
        >
            <Route
                path={globalData.routes['home']}
                element={
                    <ProtectedRoute>
                        <HomePage globalData={globalData} />
                    </ProtectedRoute>
                }
            />
            <Route
                path={globalData.routes['profile']}
                element={
                    <ProtectedRoute>
                        <ProfilePage csrfToken={csrfToken} globalData={globalData} />
                    </ProtectedRoute>
                }
            />
            <Route
                path={globalData.routes['login']}
                element={
                    <AnonymousRoute>
                        <LoginPage csrfToken={csrfToken} globalData={globalData} />
                    </AnonymousRoute>
                }
            />
            <Route
                path={globalData.routes['registration']}
                element={
                    <AnonymousRoute>
                        <RegistrationPage csrfToken={csrfToken} globalData={globalData} />
                    </AnonymousRoute>
                }
            />
            <Route
                path={globalData.routes['logout']}
                element={
                    <ProtectedRoute>
                        <LogoutPage globalData={globalData} />
                    </ProtectedRoute>
                }
            />
        </Route>
    )
)

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
    <React.StrictMode>
        <RouterProvider router={router} />
    </React.StrictMode>
)