import { Link } from 'react-router'

export default function Gallery() {
  return (
    <main>
      <h1>Gallery</h1>
      <img src="/large.jpg" alt="Large picture" width={400} height={400} />
      <p>
        <Link to="/">Back</Link>
      </p>
    </main>
  )
}
