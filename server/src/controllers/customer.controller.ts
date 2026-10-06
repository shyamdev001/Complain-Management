import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { Customer, ICustomer } from '../models/Customer';
import { Complaint } from '../models/Complaint';
import { AuditAction, OPEN_STATUSES } from '../types/enums';
import { recordAudit } from '../services/audit.service';
import { LIST_PROJECTION, actorOf, serializeListItem } from '../services/complaint.service';
import { escapeRegex, generateCustomerCode } from '../utils/ids';

function serializeCustomer(c: ICustomer | (Record<string, any> & { _id: unknown })) {
  return {
    id: String(c._id),
    customerCode: c.customerCode,
    name: c.name,
    mobile: c.mobile,
    alternateMobile: c.alternateMobile,
    address: c.address,
    cityVillage: c.cityVillage,
    projectId: c.projectId,
    systemSizeKw: c.systemSizeKw,
    installationDate: c.installationDate,
    installedBy: c.installedBy,
    inverter: c.inverter,
    panels: c.panels,
    notes: c.notes,
    createdAt: c.createdAt,
  };
}

/** Search by mobile number, name, customer ID or project ID - one box, used while the customer is on the phone. */
export const listCustomers = catchAsync(async (req: Request, res: Response) => {
  const { q, page, limit } = req.query as any;
  const filter: Record<string, unknown> = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { mobile: rx }, { customerCode: rx }, { projectId: rx }, { cityVillage: rx }];
  }

  const [total, customers] = await Promise.all([
    Customer.countDocuments(filter),
    Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const openCounts = await Complaint.aggregate([
    { $match: { customer: { $in: customers.map((c) => c._id) }, archived: false, status: { $in: OPEN_STATUSES } } },
    { $group: { _id: '$customer', count: { $sum: 1 } } },
  ]);
  const openMap = new Map(openCounts.map((r) => [String(r._id), r.count]));

  res.json({
    customers: customers.map((c) => ({ ...serializeCustomer(c), openComplaints: openMap.get(String(c._id)) ?? 0 })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** Customer profile plus their full service history (every complaint, newest first). */
export const getCustomer = catchAsync(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) throw ApiError.notFound('Customer not found');

  const complaints = await Complaint.find({ customer: customer._id, archived: false })
    .select(LIST_PROJECTION)
    .sort({ createdAt: -1 })
    .lean();
  const history = complaints.map(serializeListItem);

  res.json({
    customer: serializeCustomer(customer),
    serviceHistory: history,
    openComplaints: history.filter((c) => OPEN_STATUSES.includes(c.status)),
  });
});

export const createCustomer = catchAsync(async (req: Request, res: Response) => {
  const customer = await Customer.create({
    ...req.body,
    alternateMobile: req.body.alternateMobile || undefined,
    customerCode: await generateCustomerCode(),
    createdBy: req.user!.id,
  });

  await recordAudit({
    action: AuditAction.CUSTOMER_CREATED,
    actor: actorOf(req),
    targetType: 'Customer',
    targetId: customer._id.toString(),
    targetLabel: `${customer.customerCode} ${customer.name}`,
    req,
  });

  // Same mobile on another record is allowed (shared family phone) but worth flagging to the office.
  const sameMobile = await Customer.countDocuments({ mobile: customer.mobile, _id: { $ne: customer._id } });
  res.status(201).json({ customer: serializeCustomer(customer), duplicateMobile: sameMobile > 0 });
});

export const updateCustomer = catchAsync(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw ApiError.notFound('Customer not found');

  for (const [key, value] of Object.entries(req.body)) {
    customer.set(key, value === '' ? undefined : value);
  }
  await customer.save();

  await recordAudit({
    action: AuditAction.CUSTOMER_UPDATED,
    actor: actorOf(req),
    targetType: 'Customer',
    targetId: customer._id.toString(),
    targetLabel: `${customer.customerCode} ${customer.name}`,
    details: `Fields: ${Object.keys(req.body).join(', ')}`,
    req,
  });
  res.json({ customer: serializeCustomer(customer) });
});
