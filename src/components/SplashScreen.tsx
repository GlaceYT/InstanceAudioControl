import React, { useEffect } from "react";
import { motion } from "framer-motion";
import logoImg from "../assets/logo.png";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    // Show splash screen for exactly 1.0 second, then transition cleanly
    const timer = setTimeout(onComplete, 1000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="absolute inset-0 z-[9999] flex flex-col items-center justify-center bg-[#070709]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeInOut" } }}
    >
      <div className="flex flex-col items-center gap-5 text-center">
        {/* Sleek fade-up for the branded logo */}
        <motion.div
          className="flex h-24 w-24 items-center justify-center"
          initial={{ y: 20, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, cubicBezier: [0.16, 1, 0.3, 1] }}
        >
          <img src={logoImg} alt="logo" className="h-full w-full object-contain" />
        </motion.div>

        {/* Clean, minimalist text fade-up */}
        <motion.h1
          className="text-sm font-bold tracking-[6px] text-text-primary uppercase pl-[6px]"
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          Instance Audio
        </motion.h1>
      </div>
    </motion.div>
  );
}
