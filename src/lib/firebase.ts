import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  collection, 
  setDoc,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export async function checkIsAdmin(email: string | null): Promise<boolean> {
  if (!email) return false;
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const adminDoc = await getDoc(doc(db, 'admins', normalizedEmail));
    return adminDoc.exists();
  } catch (error) {
    console.error('Admin kontrol hatası:', error);
    return false;
  }
}

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

// Blog İşlemleri
export const blogsCollection = collection(db, 'blogs');

export const subscribeToBlogs = (callback: (blogs: any[]) => void, isAdmin: boolean = false) => {
  let q;
  if (isAdmin) {
    q = query(blogsCollection, orderBy('updatedAt', 'desc'));
  } else {
    q = query(blogsCollection, where('status', '==', 'published'), orderBy('updatedAt', 'desc'));
  }
  
  return onSnapshot(q, (snapshot) => {
    const blogs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(blogs);
  });
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  const message = error?.message || String(error);
  const code = error?.code || 'unknown';
  
  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  if (code === 'permission-denied' || message.includes('permission-denied')) {
    throw new Error(`permission-denied: ${path}`);
  }
  throw error;
}

// Başlığı URL/ID dostu hale getiren yardımcı fonksiyon
const slugify = (text: string) => {
  const trMap: { [key: string]: string } = {
    'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ş': 's', 'Ş': 's',
    'ü': 'u', 'Ü': 'u', 'ı': 'i', 'İ': 'i', 'ö': 'o', 'Ö': 'o'
  };
  return text.toLowerCase()
    .replace(/[çğşüıö]/g, (match) => trMap[match])
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const saveBlog = async (id: string | null, data: any) => {
  const blogData = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  try {
    if (id) {
      // Başlık değişmiş mi kontrol et
      const newBaseSlug = slugify(data.title) || 'adsiz-yazi';
      
      // Mevcut ID, yeni başlıktan üretilen slug ile aynı değilse (veya onu içermiyorsa) TAŞIMA yap
      // slugify('Yeni Başlık') -> 'yeni-baslik'
      // Eğer mevcut id 'eski-baslik-123' ise ve yeni slug 'yeni-baslik' ise isim değişmeli.
      if (!id.startsWith(newBaseSlug)) {
        // 1. Yeni ID belirle (çakışma kontrolü ile)
        let finalId = newBaseSlug;
        let counter = 1;
        while (true) {
          const checkDoc = await getDoc(doc(db, 'blogs', finalId));
          if (!checkDoc.exists()) break;
          counter++;
          finalId = `${newBaseSlug}-${counter}`;
          if (counter > 100) break;
        }

        // 2. Mevcut verileri çek ve yeni ID ile kaydet
        const oldDoc = await getDoc(doc(db, 'blogs', id));
        const mergedData = {
          ...oldDoc.data(),
          ...blogData,
        };
        
        await setDoc(doc(db, 'blogs', finalId), mergedData);
        
        // 3. Eski dokümanı sil
        await deleteDoc(doc(db, 'blogs', id));
        
        return finalId;
      } else {
        // Başlık (slug olarak) aynı veya çok benzerse sadece güncelle
        const blogRef = doc(db, 'blogs', id);
        await updateDoc(blogRef, blogData);
        return id;
      }
    } else {
      const baseSlug = slugify(data.title) || 'adsiz-yazi';
      let finalId = baseSlug;
      let counter = 1;
      
      // Benzersiz bir ID bulana kadar kontrol et
      while (true) {
        const checkDoc = await getDoc(doc(db, 'blogs', finalId));
        if (!checkDoc.exists()) {
          break;
        }
        counter++;
        finalId = `${baseSlug}-${counter}`;
        
        // Güvenlik: Sonsuz döngü olmaması için 100 denemeden sonra bırak
        if (counter > 100) {
          finalId = `${baseSlug}-${Math.random().toString(36).substr(2, 5)}`;
          break;
        }
      }
      
      const blogRef = doc(db, 'blogs', finalId);
      await setDoc(blogRef, {
        ...blogData,
        createdAt: serverTimestamp()
      });
      return finalId;
    }
  } catch (error) {
    handleFirestoreError(error, id ? OperationType.UPDATE : OperationType.CREATE, id ? `blogs/${id}` : 'blogs');
    throw error;
  }
};

export const deleteBlogFromFirebase = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'blogs', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `blogs/${id}`);
    throw error;
  }
};
