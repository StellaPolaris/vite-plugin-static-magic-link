import { Link } from 'react-router'
import small from '../assets/small.png'

export default function Home() {
  return (
    <main className="hero">
      <h1>Happy birthday!</h1>
      <img src={small} alt="Small picture" width={24} height={24} />
      <p>
        <Link to="/gallery">See the gallery</Link>
      </p>
    </main>
  )
}
