import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // Mock delay to simulate real API
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Accept any email/password combination for demo
    if (email && password) {
      const mockUser = {
        id: "user_123",
        email: email,
        name: email.includes("dr.")
          ? `Dr. ${email.split("@")[0].replace("dr.", "").replace(".", " ")}`
          : `Dr. ${email.split("@")[0]}`,
      }

      const mockToken = `mock_jwt_token_${Date.now()}`

      return NextResponse.json({
        success: true,
        token: mockToken,
        user: mockUser,
      })
    }

    return NextResponse.json({ success: false, message: "Email and password are required" }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ success: false, message: "Login failed" }, { status: 500 })
  }
}
