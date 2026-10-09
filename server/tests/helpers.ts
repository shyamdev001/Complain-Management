import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Installer } from '../src/models/Installer';
import { Customer } from '../src/models/Customer';
import { UserRole } from '../src/types/enums';
import { signAccessToken } from '../src/services/token.service';
import { generateCustomerCode } from '../src/utils/ids';

let counter = 0;

export async function createUser(role: UserRole, installerId?: unknown, name = 'Test User') {
  counter += 1;
  const user = await User.create({
    name,
    email: `user${counter}-${Date.now()}@test.dev`,
    passwordHash: await bcrypt.hash('Password123!', 4),
    role,
    installer: installerId,
  });
  const token = signAccessToken({ sub: String(user._id), role: user.role, name: user.name, email: user.email });
  return { user, cookie: `accessToken=${token}` };
}

/** The standard cast: the two installer companies, one office admin and one customer. */
export async function setupWorld() {
  const ap = await Installer.create({ name: 'AP Enterprise' });
  const navia = await Installer.create({ name: 'Navia' });
  // `admin` is the super admin (can do everything); `staff` is an ordinary office login.
  const admin = await createUser(UserRole.SUPER_ADMIN, undefined, 'Office Admin');
  const staff = await createUser(UserRole.ADMIN, undefined, 'Office Staff');
  // A leftover installer login from before installers moved to Excel sheets - it must have no access.
  const installerUser = await createUser(UserRole.INSTALLER, ap._id, 'AP Tech');
  const customer = await Customer.create({
    customerCode: await generateCustomerCode(),
    name: 'Ramesh Patel',
    mobile: '9876543210',
    address: 'Near Dairy',
    cityVillage: 'Keriavi',
    projectId: 'PRJ-101',
    systemSizeKw: 3,
  });
  return { ap, navia, admin, staff, installerUser, customer };
}

export async function createComplaint(
  world: Awaited<ReturnType<typeof setupWorld>>,
  installerId: unknown,
  overrides: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/api/complaints')
    .set('Cookie', world.admin.cookie)
    .send({
      customerId: String(world.customer._id),
      category: 'Solar generation issue',
      description: 'Customer says solar generation has been very low for the last 3 days.',
      priority: 'HIGH',
      installerId: String(installerId),
      ...overrides,
    });
  return res;
}
