import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e password obbligatorie.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password minimo 8 caratteri.' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) {
      return NextResponse.json({ error: 'Email già registrata.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email:        email.toLowerCase().trim(),
        passwordHash,
        name:         name || null,
        plan:         'free',
      },
    });

    return NextResponse.json({ ok: true, userId: user.id }, { status: 201 });
  } catch (e) {
    console.error('[register]', e);
    return NextResponse.json({ error: 'Errore interno.' }, { status: 500 });
  }
}
