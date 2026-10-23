// Imported only after the homepage is idle (see ModulesSection), so the
// animation library never weighs on first load. Until it arrives, note cards
// are plain buttons and the modal opens without the morph.
export { AnimatePresence, MotionConfig, motion } from "motion/react";
