// src/components/PageTransition.tsx
import { motion } from "framer-motion"
import { useLocation } from "react-router-dom"
import type { Transition } from "framer-motion"

const pageVariants = {
  initial: { opacity: 0, y: 0},
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: 0 },
}

const pageTransition: Transition = {
  type: "tween",
  ease: [0.25, 0.46, 0.45, 0.94],
  duration: 0.5,
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  return (
    <motion.div
      key={location.pathname}
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
      className="min-h-screen"
    >
      {children}
    </motion.div>
  )
}