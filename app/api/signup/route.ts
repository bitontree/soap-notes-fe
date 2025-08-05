import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json()

    // Mock delay to simulate real API
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Accept any valid input for demo
    if (name && email && password) {
      const mockUser = {
        id: `user_${Date.now()}`,
        email: email,
        name: name,
      }

      const mockToken = `mock_jwt_token_${Date.now()}`

      return NextResponse.json({
        success: true,
        token: mockToken,
        user: mockUser,
      })
    }

    return NextResponse.json({ success: false, message: "All fields are required" }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ success: false, message: "Signup failed" }, { status: 500 })
  }
}
