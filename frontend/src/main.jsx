import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './styles.css';

function Home() {
  return <main className="shell">
    <header><span className="brand-mark">M</span><span className="brand-name">MediCloud</span><span className="badge">EDUCATIONAL DEMO</span></header>
    <section className="hero">
      <div className="eyebrow">CARE THAT CONNECTS</div>
      <h1>Your health, <span>in good hands.</span></h1>
      <p>A secure place to connect with care teams, manage appointments, and keep your health journey organized.</p>
      <Link className="primary-link" to="/about">Explore the platform <span aria-hidden="true">→</span></Link>
      <div className="hero-art" aria-hidden="true"><div className="sun"/><div className="arch"><div className="cross">+</div><div className="arch-line"/></div><div className="leaf leaf-one"/><div className="leaf leaf-two"/></div>
      <div className="hero-note"><span className="note-icon">✳</span><div><strong>Care, made clearer.</strong><small>One step at a time.</small></div></div>
    </section>
    <section className="cards" aria-label="Platform highlights">
      <article><span className="card-icon lilac">◷</span><h2>Appointments</h2><p>Plan your next visit with a care team that fits your needs.</p><span className="card-label">BOOK WITH EASE</span></article>
      <article><span className="card-icon peach">♡</span><h2>Your care, together</h2><p>Keep important health information organized in one place.</p><span className="card-label">MADE FOR YOU</span></article>
      <article><span className="card-icon mint">✳</span><h2>Thoughtful by design</h2><p>Built with privacy and secure access at its foundation.</p><span className="card-label">PRIVACY FIRST</span></article>
    </section>
    <footer>For demonstration only · Use synthetic data · <Link to="/about">About this project</Link></footer>
  </main>;
}

function About() {
  return <main className="shell about"><header><Link className="brand-name" to="/">← MediCloud</Link></header><div className="eyebrow">ABOUT THE PROJECT</div><h1>Care, connected.</h1><p>MediCloud is an educational demonstration of a secure, cloud-native hospital appointments and medical records platform. It is not a medical service.</p><Link className="primary-link" to="/">Back to home <span aria-hidden="true">→</span></Link></main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><Routes><Route path="/" element={<Home />} /><Route path="/about" element={<About />} /></Routes></BrowserRouter></React.StrictMode>);
