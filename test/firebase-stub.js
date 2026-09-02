// No-op Firebase stub used only in tests (aliased for firebase/app, firebase/auth,
// firebase/firestore in vitest.config.js). It exports the union of every symbol
// the service layer imports from those packages, so nothing initializes real
// Firebase or hits the network. Signed-in code paths are never exercised by the
// deterministic tests (they run in demo mode with user = null/undefined).
export const initializeApp = () => ({})
export const getAuth = () => ({})
export class GoogleAuthProvider {}
export const getFirestore = () => ({})
export const doc = () => ({})
export const getDoc = async () => ({ exists: () => false, data: () => null })
export const setDoc = async () => {}
export const deleteDoc = async () => {}
export const collection = () => ({})
export const getDocs = async () => ({ docs: [], forEach() {} })
export const query = () => ({})
export const orderBy = () => ({})
export const where = () => ({})
export const limit = () => ({})
export const onSnapshot = () => () => {}
export const writeBatch = () => ({ set() { return this }, delete() { return this }, commit: async () => {} })
export const serverTimestamp = () => null
export const updateDoc = async () => {}
export const addDoc = async () => ({ id: 'stub' })
export default {}
