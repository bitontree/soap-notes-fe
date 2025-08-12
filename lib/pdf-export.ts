import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export interface PDFExportOptions {
  filename?: string
  orientation?: 'portrait' | 'landscape'
  format?: 'a4' | 'letter' | 'legal'
  margin?: number
}

export const exportElementToPDF = async (
  element: HTMLElement,
  options: PDFExportOptions = {}
): Promise<void> => {
  const {
    filename = 'soap-note.pdf',
    orientation = 'portrait',
    format = 'a4',
    margin = 20
  } = options

  try {
    // Convert HTML element to canvas
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: element.scrollWidth,
      height: element.scrollHeight
    })

    // Create PDF document
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format
    })

    const imgWidth = pdf.internal.pageSize.getWidth() - (margin * 2)
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    let position = margin

    // Add first page
    pdf.addImage(canvas, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= pdf.internal.pageSize.getHeight() - (margin * 2)

    // Add additional pages if content is longer than one page
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight + margin
      pdf.addPage()
      pdf.addImage(canvas, 'PNG', margin, position, imgWidth, imgHeight)
      heightLeft -= pdf.internal.pageSize.getHeight() - (margin * 2)
    }

    // Save the PDF
    pdf.save(filename)
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw new Error('Failed to generate PDF. Please try again.')
  }
}

export const exportSOAPNoteToPDF = async (
  note: any,
  options: PDFExportOptions = {}
): Promise<void> => {
  const {
    filename = `soap-note-${note.id || Date.now()}.pdf`,
    orientation = 'portrait',
    format = 'a4',
    margin = 20
  } = options

  // Create a temporary container for the PDF content
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '-9999px'
  container.style.width = '800px'
  container.style.backgroundColor = '#ffffff'
  container.style.padding = '40px'
  container.style.fontFamily = 'Arial, sans-serif'
  container.style.fontSize = '12px'
  container.style.lineHeight = '1.6'
  container.style.color = '#333'

  // Generate HTML content for the SOAP note
  container.innerHTML = `
    <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px;">
      <h1 style="color: #2563eb; margin: 0; font-size: 24px;">SOAP Medical Note</h1>
      <p style="margin: 5px 0; color: #666;">Generated on ${new Date().toLocaleDateString()}</p>
    </div>

    <div style="margin-bottom: 20px;">
      <h3 style="color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px;">
        Patient Information
      </h3>
      <p><strong>Patient:</strong> ${note.patient_name || 'Unknown Patient'}</p>
      <p><strong>Date:</strong> ${new Date(note.created_at).toLocaleDateString()}</p>
      <p><strong>Time:</strong> ${new Date(note.created_at).toLocaleTimeString()}</p>
    </div>

    <div style="margin-bottom: 20px;">
      <h3 style="color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px;">
        Subjective
      </h3>
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #3b82f6;">
        ${formatSOAPSection(note.soap_data.subjective)}
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <h3 style="color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px;">
        Objective
      </h3>
      <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; border-left: 4px solid #22c55e;">
        ${formatSOAPSection(note.soap_data.objective)}
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <h3 style="color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px;">
        Assessment
      </h3>
      <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b;">
        ${note.soap_data.assessment || 'No assessment available'}
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <h3 style="color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px;">
        Plan
      </h3>
      <div style="background-color: #f3e8ff; padding: 15px; border-radius: 6px; border-left: 4px solid #a855f7;">
        ${formatSOAPSection(note.soap_data.plan)}
      </div>
    </div>

    ${note.summary ? `
    <div style="margin-bottom: 20px;">
      <h3 style="color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px;">
        Summary
      </h3>
      <div style="background-color: #f1f5f9; padding: 15px; border-radius: 6px; border-left: 4px solid #64748b;">
        ${note.summary}
      </div>
    </div>
    ` : ''}

    <div style="margin-top: 40px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px; color: #666; font-size: 10px;">
      <p>This document was generated electronically by SOAP Medical Notes System</p>
    </div>
  `

  // Add container to DOM temporarily
  document.body.appendChild(container)

  try {
    // Export to PDF
    await exportElementToPDF(container, {
      filename,
      orientation,
      format,
      margin
    })
  } finally {
    // Clean up
    document.body.removeChild(container)
  }
}

// Helper function to format SOAP sections
const formatSOAPSection = (data: any): string => {
  if (!data) return 'No data available'
  
  if (typeof data === 'string') {
    return data
  }
  
  if (typeof data === 'object') {
    // Special handling for plan section with recommendations
    if (data.recommendations && Array.isArray(data.recommendations)) {
      const recs = data.recommendations
        .filter((r: string) => r && r.trim() !== '')
        .map((r: string, i: number) => `${i + 1}. ${r}`)
        .join('<br>')
      
      const followUp = data.follow_up ? `<br><br><strong>Follow-up:</strong> ${data.follow_up}` : ''
      return `Recommendations:<br>${recs}${followUp}`
    }
    
    // Handle other object types
    return Object.entries(data)
      .filter(([_, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        return `<strong>${formattedKey}:</strong> ${value}`
      })
      .join('<br><br>')
  }
  
  return String(data)
}
