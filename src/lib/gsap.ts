import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)
// Keep animated elements on their own GPU layer for the whole tween. With the default
// ("auto") GSAP drops back to 2D transforms at the end, forcing a repaint mid-scroll.
gsap.config({ force3D: true })

export const MOTION_OK = '(prefers-reduced-motion: no-preference)'

export { gsap, ScrollTrigger, useGSAP }
