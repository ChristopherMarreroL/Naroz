// Reuse the existing bounded signature/dimension readers. Full decode and its cleanup
// remain in the image tools, which support different input/output format sets.
export { preflightImage } from '../../features/image/lib/imageLimits'
