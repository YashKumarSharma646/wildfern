import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export const MOTION_OK = '(prefers-reduced-motion: no-preference)'

export { gsap, ScrollTrigger, useGSAP }
