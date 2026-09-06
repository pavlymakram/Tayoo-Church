export function sanitizeUser(user: {
  id: string;
  churchId: string | null;
  role: string;
  fullName: string;
  phone: string;
  secondaryPhone: string | null;
  address: string | null;
  grade: string | null;
  birthDate: Date | null;
  confessionFather: string | null;
  fatherJob: string | null;
  motherJob: string | null;
  isMotherWorking: boolean;
  qrCodeId: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    churchId: user.churchId,
    role: user.role,
    fullName: user.fullName,
    phone: user.phone,
    secondaryPhone: user.secondaryPhone,
    address: user.address,
    grade: user.grade,
    birthDate: user.birthDate,
    confessionFather: user.confessionFather,
    fatherJob: user.fatherJob,
    motherJob: user.motherJob,
    isMotherWorking: user.isMotherWorking,
    qrCodeId: user.qrCodeId,
    createdAt: user.createdAt,
  };
}
