import React, { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Navbar, Container, Nav } from 'react-bootstrap'

export default function MainLayout(props) {
	let [logged, setLogged] = useState(props.globalData.userIsLogged())

	return (
		<>
			<header>
				<Navbar bg="light" expand="lg">
					<Container>
						<NavLink to={props.globalData.routes.home} className='navbar-brand'>
							Chat
						</NavLink>
						<Navbar.Toggle aria-controls="basic-navbar-nav" />
						<Navbar.Collapse id="basic-navbar-nav">
							<Nav className="me-auto">
								{ logged ?
									<>
										<NavLink to={props.globalData.routes.home} className='nav-item nav-link'>Chat</NavLink>
										<NavLink to={props.globalData.routes.profile} className='nav-item nav-link'>Profile</NavLink>
										<NavLink to={props.globalData.routes.logout} className='nav-item nav-link'>Logout</NavLink>
									</>
									:
									<>
										<NavLink to={props.globalData.routes.login} className='nav-item nav-link'>Login</NavLink>
										<NavLink to={props.globalData.routes.registration} className='nav-item nav-link'>Registration</NavLink>
									</>
								}
							</Nav>
						</Navbar.Collapse>
					</Container>
				</Navbar>
			</header>
			<Container className='my-4'>
				<Outlet context={[logged, setLogged]} />
			</Container>
		</>
	)
}