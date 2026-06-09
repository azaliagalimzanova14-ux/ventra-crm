import type { User } from "./types";

const USERS_KEY = "nexus_crm_users";
const SESSION_KEY = "nexus_crm_session";
const DEMO_EMAIL = "demo@nexuscrm.io";
const DEMO_PASSWORD = "demo1234";

interface StoredUser extends User {
  password: string;
}

function getUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    const demoUser: StoredUser = {
      id: "demo-user",
      name: "Alex Morgan",
      email: DEMO_EMAIL,
      company: "Nexus Studio",
      role: "Owner",
      password: DEMO_PASSWORD,
    };
    localStorage.setItem(USERS_KEY, JSON.stringify([demoUser]));
    return [demoUser];
  }
  return JSON.parse(raw) as StoredUser[];
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getSession(): User | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as User;
}

export function setSession(user: User) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function login(
  email: string,
  password: string,
): { success: true; user: User } | { success: false; error: string } {
  const users = getUsers();
  const found = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
  );
  if (!found) {
    return { success: false, error: "Invalid email or password" };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _password, ...user } = found;
  setSession(user);
  return { success: true, user };
}

export function register(data: {
  name: string;
  email: string;
  password: string;
  company: string;
}): { success: true; user: User } | { success: false; error: string } {
  const users = getUsers();
  if (users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
    return { success: false, error: "An account with this email already exists" };
  }
  const newUser: StoredUser = {
    id: crypto.randomUUID(),
    name: data.name,
    email: data.email,
    company: data.company,
    role: "Owner",
    password: data.password,
  };
  users.push(newUser);
  saveUsers(users);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _password, ...user } = newUser;
  setSession(user);
  return { success: true, user };
}

export { DEMO_EMAIL, DEMO_PASSWORD };
