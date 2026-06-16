import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Store,
  Package,
  Truck,
  ChartColumn,
  ShieldCheck,
  Bell,
  ArrowRight,
} from "lucide-react";

// social icons, just the raw SVG paths from each platform
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.554 4.122 1.523 5.854L.057 23.882l6.19-1.443A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.36-.213-3.724.868.936-3.619-.235-.374A9.818 9.818 0 1112 21.818z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// logo - green rounded square with "PB" next to the wordmark
function Logo({ light = false }) {
  return (
    <span className="flex items-center gap-2">
      <img src="/icon.png" alt="PharmaBridge" className="w-9 h-9 object-contain" />
      <span
        className={`text-lg font-bold tracking-tight ${
          light ? "text-white" : "text-text-primary"
        }`}
      >
        PharmaBridge
      </span>
    </span>
  );
}

const FEATURES = [
  {
    icon: Store,
    title: "B2B Marketplace",
    text: "Browse pharmaceutical products from verified companies",
  },
  {
    icon: Package,
    title: "Simple Ordering",
    text: "Build a cart from one company and place orders easily",
  },
  {
    icon: Truck,
    title: "Live Delivery Tracking",
    text: "Follow every order from warehouse pickup to pharmacy arrival",
  },
  {
    icon: ChartColumn,
    title: "Financial Records",
    text: "Track debts, payments, and balances per company relationship",
  },
  {
    icon: ShieldCheck,
    title: "Verified Accounts",
    text: "Email verification and admin approval keep the network trusted",
  },
  {
    icon: Bell,
    title: "Real-time Notifications",
    text: "Instant updates on orders, approvals, and deliveries",
  },
];

const STEPS = [
  {
    title: "Register",
    text: "Sign up as a company, pharmacy, or driver",
  },
  {
    title: "Get Verified",
    text: "Verify your email and wait for admin or company approval",
  },
  {
    title: "Start Trading",
    text: "Place orders, track deliveries, manage payments",
  },
];

const ROLES = [
  {
    emoji: "🏢",
    title: "Pharma Company",
    text: "Manage products, incoming orders, drivers, and financials",
  },
  {
    emoji: "🏥",
    title: "Pharmacy",
    text: "Browse marketplace, place orders, track deliveries, manage debt",
  },
  {
    emoji: "🚗",
    title: "Driver",
    text: "Accept delivery assignments and complete step-by-step delivery flow",
  },
  {
    emoji: "🛡️",
    title: "Admin",
    text: "Approve registrations, monitor all orders across the platform",
  },
];

const SOCIALS = [
  { icon: WhatsAppIcon, href: "https://wa.me/", label: "WhatsApp" },
  { icon: FacebookIcon, href: "https://facebook.com/", label: "Facebook" },
  { icon: InstagramIcon, href: "https://instagram.com/", label: "Instagram" },
  { icon: XIcon, href: "https://twitter.com/", label: "Twitter" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* top nav */}
      <header className="sticky top-0 z-50 bg-white shadow-sm">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary-subtle active:scale-[0.98]"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#14532d] hover:shadow-md active:scale-[0.98]"
            >
              Register
            </Link>
          </div>
        </nav>
      </header>

      {/* hero */}
      <section
        className="relative bg-linear-to-br from-primary to-[#14532d]"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1600&q=80")',
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-32"
        >
          <span className="mb-5 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white ring-1 ring-inset ring-white/25 backdrop-blur">
            B2B Pharmaceutical Platform
          </span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
            Connecting Pharma Companies to Pharmacies
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">
            A complete marketplace for ordering, tracking, and delivering
            pharmaceutical products through certified drivers.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/register"
              className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-primary shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/10 active:scale-[0.98]"
            >
              Get Started
              <ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-lg border-2 border-white/80 px-6 py-3 text-base font-semibold text-white transition-colors duration-200 hover:border-white hover:bg-white/10 active:scale-[0.98]"
            >
              Sign In
            </Link>
          </div>
        </motion.div>
      </section>

      {/* features */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-text-primary">
            Everything you need in one platform
          </h2>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.1 } },
            }}
            className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <motion.div
                key={title}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
                className="group rounded-xl border border-border bg-white p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-green-200 hover:shadow-lg hover:shadow-primary/5"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
                  <Icon size={24} />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-text-primary">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {text}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* how it works */}
      <section className="bg-primary-subtle py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-text-primary">
            How PharmaBridge works
          </h2>
          <div className="relative mt-14 grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-6">
            {/* the line linking the steps, desktop only */}
            <div className="absolute left-0 right-0 top-7 hidden h-0.5 bg-green-200 md:block" />
            {STEPS.map(({ title, text }, i) => (
              <div
                key={title}
                className="relative flex flex-col items-center text-center"
              >
                <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-white shadow-md">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-text-primary">
                  {title}
                </h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-text-secondary">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* roles */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-text-primary">
            Built for every role
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {ROLES.map(({ emoji, title, text }) => (
              <div
                key={title}
                className="rounded-xl border border-t-4 border-border border-t-primary bg-white p-6 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
              >
                <span className="text-3xl">{emoji}</span>
                <h3 className="mt-3 text-lg font-semibold text-text-primary">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* contact */}
      <section className="bg-primary py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Get in touch
          </h2>
          <p className="mt-3 text-white/70">Reach us on social media</p>
          <div className="mt-8 flex justify-center gap-4">
            {SOCIALS.map(({ icon: Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/40 text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-white hover:bg-white hover:text-primary active:scale-95"
              >
                <Icon />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="bg-[#14532d] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center sm:px-6">
          <Logo light />
          <p className="text-sm text-white/60">
            © 2026 PharmaBridge. All rights reserved.
          </p>
          <p className="text-xs text-white/40">
            B2B Pharmaceutical Delivery Platform
          </p>
        </div>
      </footer>
    </div>
  );
}
