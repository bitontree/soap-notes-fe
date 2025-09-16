"use client";

import React, { forwardRef, useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { parse, format, isValid } from "date-fns";
import { saveFormToDatabase, fetchFormById, fetchLatestUserForm } from "@/lib/api"
import {
  Plus,
  Trash2,
  Eye,
  Settings,
  Copy,
  Save,
  FileText,
  Calendar,
  Hash,
  Type,
  CheckSquare,
  List,
  Upload,
  Star,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Users,
  Heart,
  Stethoscope,
  X,
} from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface DateInputProps {
    value?: string;
    onChange: (val: string) => void;
    required?: boolean;
    placeholder?: string;
  }

interface Question {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  min?: number;
  max?: number;
  options?: Option[];
  accept?: string;
  maxRating?: number;
  scale?: string;
  conditionalLogic?: any;
  value?: string;
}

interface Section {
  id: string;
  name: string;
  questions: Question[];
  expanded: boolean;
}

interface QuestionEditorProps {
  question: Question;
  sectionId: string;
  onUpdate: (questionId: string, updates: Partial<Question>) => void;
  onDelete: (questionId: string) => void;
}

const CustomInput = forwardRef<HTMLInputElement, any>(
    ({ value, onClick, onChange, onBlur, placeholder }, ref) => {
      return (
        <input
          ref={ref}
          value={value}
          onClick={onClick}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          className="border p-2 rounded w-full"
        />
      );
    }
  );
  CustomInput.displayName = "CustomInput";
  
  const DateInput: React.FC<DateInputProps> = ({ value, onChange, required, placeholder }) => {
    const [inputValue, setInputValue] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  

    useEffect(() => {
      if (!inputValue) {
        setSelectedDate(null);
        return;
      }
      const formats = ['dd/MM/yyyy', 'dd/MM/yy'];
      let parsedDate: Date | null = null;
      for (const fmt of formats) {
        const d = parse(inputValue, fmt, new Date());
        if (isValid(d)) {
          parsedDate = d;
          break;
        }
      }
      setSelectedDate(parsedDate);
    }, [inputValue]);
  
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      
      const allowed = /^(\d{0,2})(\/?)(\d{0,2})(\/?)(\d{0,4})$/.test(val);
      if (!allowed && val !== '') return;
      setInputValue(val);
    };
  
    const handleDateChange = (date: Date | null) => {
      if (date && isValid(date)) {
        const formatted = format(date, 'dd/MM/yyyy');
        setInputValue(formatted);
        setSelectedDate(date);
      } else {
        setInputValue('');
        setSelectedDate(null);
      }
    };
  
    return (
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <input
          type="text"
          name="date-input"
          placeholder="dd/mm/yyyy"
          value={inputValue}
          onChange={handleInputChange}
          maxLength={10}
          style={{ padding: '8px', fontSize: '16px', width: '140px' }}
        />
        <DatePicker
          selected={selectedDate}
          onChange={handleDateChange}
          inline
          dateFormat="dd/MM/yyyy"
        />
      </div>
    );
  };
  
  
const QuestionEditor: React.FC<QuestionEditorProps> = ({ question, onUpdate, onDelete }) => {
  const [newOptionLabel, setNewOptionLabel] = useState("");

  const handleOptionChange = (index: number, value: string) => {
    if (!question.options) return;
    const newOptions = [...question.options];
    newOptions[index].label = value;
    newOptions[index].value = value.toLowerCase().replace(/\s+/g, "-");
    onUpdate(question.id, { options: newOptions });
  };

  const addOption = () => {
    if (!newOptionLabel.trim()) return;
    const newOpt = {
      label: newOptionLabel.trim(),
      value: newOptionLabel.trim().toLowerCase().replace(/\s+/g, "-"),
    };
    onUpdate(question.id, {
      options: [...(question.options || []), newOpt],
    });
    setNewOptionLabel("");
  };

  const removeOption = (index: number) => {
    if (!question.options) return;
    const newOptions = question.options.filter((_, i) => i !== index);
    onUpdate(question.id, { options: newOptions });
  };

  return (
    <div className="border rounded-lg p-4 mb-4 bg-white shadow-sm">
      <div className="mb-3">
        <label className="block font-semibold mb-1 text-sm text-gray-700">Question Label</label>
        <input
          type="text"
          value={question.label}
          onChange={(e) => onUpdate(question.id, { label: e.target.value })}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {(question.type === "text" || question.type === "textarea") && (
        <div className="mb-3">
          <label className="block font-semibold mb-1 text-sm text-gray-700">Placeholder</label>
          <input
            type="text"
            value={question.placeholder || ""}
            onChange={(e) => onUpdate(question.id, { placeholder: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}

      {(question.type === "number") && (
        <>
          <div className="mb-3">
            <label className="block font-semibold mb-1 text-sm text-gray-700">Placeholder</label>
            <input
              type="text"
              value={question.placeholder || ""}
              onChange={(e) => onUpdate(question.id, { placeholder: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block font-semibold mb-1 text-sm text-gray-700">Min Value</label>
              <input
                type="number"
                value={question.min || ""}
                onChange={(e) => onUpdate(question.id, { min: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-sm text-gray-700">Max Value</label>
              <input
                type="number"
                value={question.max || ""}
                onChange={(e) => onUpdate(question.id, { max: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </>
      )}

      {question.type === "textarea" && (
        <div className="mb-3">
          <label className="block font-semibold mb-1 text-sm text-gray-700">Rows</label>
          <input
            type="number"
            value={question.rows || 4}
            onChange={(e) => onUpdate(question.id, { rows: Number(e.target.value) })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            min="2"
            max="10"
          />
        </div>
      )}

      {question.type === "date" && (
        <div className="mb-3">
          <label className="block font-semibold mb-1 text-sm text-gray-700">Placeholder</label>
          <input
            type="text"
            value={question.placeholder || "dd/mm/yy"}
            onChange={(e) => onUpdate(question.id, { placeholder: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}

      {question.type === "file" && (
        <div className="mb-3">
          <label className="block font-semibold mb-1 text-sm text-gray-700">Accepted File Types</label>
          <input
            type="text"
            value={question.accept || ""}
            onChange={(e) => onUpdate(question.id, { accept: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., .pdf,.doc,.jpg"
          />
        </div>
      )}

      {question.type === "rating" && (
        <>
          <div className="mb-3">
            <label className="block font-semibold mb-1 text-sm text-gray-700">Max Rating</label>
            <input
              type="number"
              value={question.maxRating || 5}
              onChange={(e) => onUpdate(question.id, { maxRating: Number(e.target.value) })}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              min="3"
              max="10"
            />
          </div>
          <div className="mb-3">
            <label className="block font-semibold mb-1 text-sm text-gray-700">Scale Type</label>
            <select
              value={question.scale || "numeric"}
              onChange={(e) => onUpdate(question.id, { scale: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="numeric">Numeric (1-{question.maxRating || 5})</option>
              <option value="stars">Stars</option>
            </select>
          </div>
        </>
      )}

      {(question.type === "dropdown" ||
        question.type === "checkbox" ||
        question.type === "radio") && (
        <div className="mb-3">
          <label className="block font-semibold mb-1 text-sm text-gray-700">Options</label>
          {question.options?.length ? (
            question.options.map((option, idx) => (
              <div key={idx} className="flex mb-2 gap-2 items-center">
                <input
                  type="text"
                  value={option.label}
                  onChange={(e) => handleOptionChange(idx, e.target.value)}
                  className="flex-grow p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeOption(idx)}
                  className="text-red-600 hover:text-red-800 font-bold px-2 py-1 rounded"
                  title="Remove option"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm italic">No options added yet.</p>
          )}
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              className="flex-grow p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add new option"
              value={newOptionLabel}
              onChange={(e) => setNewOptionLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
            <button
              type="button"
              onClick={addOption}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-3 border-t">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!question.required}
            onChange={(e) => onUpdate(question.id, { required: e.target.checked })}
            className="rounded"
          />
          <span className="font-medium text-gray-700">Required field</span>
        </label>
        <button 
          onClick={() => onDelete(question.id)} 
          className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium text-sm bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
};

const FormPreview: React.FC<{ 
  sections: Section[]; 
  formTitle: string; 
  formDescription: string;
  formId?: string;
  userId?: string;
}> = ({
  sections,
  formTitle,
  formDescription,
  formId,
  userId,
}) => {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const answers: any[] = [];
    
    sections.forEach(section => {
      section.questions.forEach(question => {
        let value: any = null;
        
        switch (question.type) {
          case 'text':
          case 'textarea':
          case 'number':
            value = formData.get(question.id) || '';
            break;
          case 'date':
            value = formData.get(question.id) || '';
            break;
          case 'dropdown':
          case 'radio':
            value = formData.get(question.id) || '';
            break;
          case 'checkbox':
            value = formData.getAll(`${question.id}[]`) || [];
            break;
          case 'file':
            const file = formData.get(question.id) as File;
            value = file ? file.name : '';
            break;
          case 'rating':
            value = formData.get(question.id) || '';
            break;
        }
        
        answers.push({
          questionId: question.id,
          questionType: question.type,
          value: value
        });
      });
    });

    const submissionData = {
      formId: formId || "temp-form-id",
      answers: answers,
      submittedBy: userId || "anonymous"
    };
    
    try {
      console.log("Submitting form:", submissionData);
      alert("Form submitted successfully!");
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Error submitting form");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg my-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">{formTitle}</h2>
        <p className="text-gray-600 text-lg">{formDescription}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {sections.map((section) => (
          <div key={section.id} className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-300">{section.name}</h3>
            <div className="space-y-6">
              {section.questions.map((question) => (
                <div key={question.id} className="space-y-2">
                  <label className="block font-medium text-gray-700">
                    {question.label}
                    {question.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  
                  {question.type === "text" && (
                    <input
                      type="text"
                      name={question.id}
                      placeholder={question.placeholder}
                      required={question.required}
                      maxLength={question.maxLength}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  
                  {question.type === "textarea" && (
                    <textarea
                      name={question.id}
                      placeholder={question.placeholder}
                      required={question.required}
                      rows={question.rows || 4}
                      maxLength={question.maxLength}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical"
                    />
                  )}
                  
                  {question.type === "number" && (
                    <input
                      type="number"
                      name={question.id}
                      placeholder={question.placeholder}
                      required={question.required}
                      min={question.min}
                      max={question.max}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  
                  {question.type === "date" && (
                    <DateInput 
                      value={question.value || ""} 
                      onChange={() => {}} 
                      required={question.required}
                      placeholder={question.placeholder}
                    />
                  )}
                  
                  {question.type === "dropdown" && (
                    <select
                      name={question.id}
                      required={question.required}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select an option...</option>
                      {question.options?.map((option, idx) => (
                        <option key={idx} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                  
                  {question.type === "radio" && (
                    <div className="space-y-3">
                      {question.options?.map((option, idx) => (
                        <label key={idx} className="flex items-center gap-3">
                          <input
                            type="radio"
                            name={question.id}
                            value={option.value}
                            required={question.required}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-gray-700">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {question.type === "checkbox" && (
                    <div className="space-y-3">
                      {question.options?.map((option, idx) => (
                        <label key={idx} className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            name={`${question.id}[]`}
                            value={option.value}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-gray-700">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {question.type === "file" && (
                    <input
                      type="file"
                      name={question.id}
                      accept={question.accept}
                      required={question.required}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  )}
                  
                  {question.type === "rating" && (
                    <div className="flex items-center gap-2">
                      {question.scale === "stars" ? (
                        <div className="flex items-center gap-1">
                          {Array.from({ length: question.maxRating || 5 }, (_, i) => (
                            <Star key={i} className="w-8 h-8 text-gray-300 hover:text-yellow-400 cursor-pointer transition-colors" />
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-4 w-full">
                          <span className="text-sm text-gray-600 font-medium">1</span>
                          <input
                            type="range"
                            name={question.id}
                            min="1"
                            max={question.maxRating || 5}
                            className="flex-grow"
                          />
                          <span className="text-sm text-gray-600 font-medium">{question.maxRating || 5}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div> 
        ))}
        
      </form>
    </div>
  );
};

const QuestionTypesDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  questionTypes: any[];
  onAddQuestion: (sectionId: string, questionType: string) => void;
  sections: Section[];
}> = ({ isOpen, onClose, questionTypes, onAddQuestion, sections }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl transform transition-transform duration-300">
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Question Types</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {questionTypes.map((type) => (
                <div key={type.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <type.icon size={20} className="text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{type.label}</h4>
                      <p className="text-sm text-gray-600 mb-2">{type.description}</p>
                      <p className="text-xs text-gray-500 mb-3">Example: {type.example}</p>
                      
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700">Add to section:</p>
                        {sections.map((section) => (
                          <button
                            key={section.id}
                            onClick={() => {
                              onAddQuestion(section.id, type.id);
                              onClose();
                            }}
                            className="w-full text-left text-sm bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 px-3 py-2 rounded border hover:border-blue-300 transition-colors"
                          >
                            {section.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PhysicianFormBuilder: React.FC = () => {
  const [sections, setSections] = useState<Section[]>([
    { id: "section-1", name: "Patient Information", questions: [], expanded: true },
  ]);
  const [formTitle, setFormTitle] = useState("Medical Assessment Form");
  const [formDescription, setFormDescription] = useState("Please fill out this form completely and accurately.");
  const [previewMode, setPreviewMode] = useState(false);
  const [questionTypeDrawerOpen, setQuestionTypeDrawerOpen] = useState(false);
  const loadSavedForm = async () => {
    try {
      const latestForm = await fetchLatestUserForm();
      if (latestForm) {
        setFormTitle(latestForm.title || "");
        setFormDescription(latestForm.description || "");
        setSections(latestForm.sections || []);
      } else {
        setFormTitle("");
        setFormDescription("");
        setSections([]);
      }
    } catch (error) {
      console.error("Error loading saved form:", error);
      setFormTitle("");
      setFormDescription("");
      setSections([]);
    }
  };
  useEffect(() => {
    loadSavedForm();
  }, []);
  const questionTypes = [
    {
      id: "text",
      label: "Text Input",
      icon: Type,
      description: "Single line text input",
      example: "Patient name, Insurance ID",
      defaultProps: { placeholder: "Enter text here", required: false, maxLength: 100 },
    },
    {
      id: "textarea",
      label: "Text Area",
      icon: MessageSquare,
      description: "Multi-line text input",
      example: "Symptoms description, Medical history",
      defaultProps: { placeholder: "Enter detailed information here", required: false, rows: 4 },
    },
    {
      id: "number",
      label: "Number Input",
      icon: Hash,
      description: "Numeric input with validation",
      example: "Age, Weight, Blood pressure",
      defaultProps: { placeholder: "Enter numeric value", required: false, min: 0, max: 999 },
    },
    {
      id: "date",
      label: "Date Picker",
      icon: Calendar,
      description: "Date selection input",
      example: "Date of birth, Last visit",
      defaultProps: { required: false, placeholder: "dd/mm/yy" },
    },
    {
      id: "dropdown",
      label: "Dropdown",
      icon: List,
      description: "Single selection from options",
      example: "Gender, Blood type, Insurance provider",
      defaultProps: {
        required: false,
        options: [
          { value: "option1", label: "Option 1" },
          { value: "option2", label: "Option 2" },
        ],
      },
    },
    {
      id: "checkbox",
      label: "Checkboxes",
      icon: CheckSquare,
      description: "Multiple selection options",
      example: "Allergies, Current medications, Symptoms",
      defaultProps: {
        required: false,
        options: [
          { value: "option1", label: "Option 1" },
          { value: "option2", label: "Option 2" },
        ],
      },
    },
    {
      id: "radio",
      label: "Radio Buttons",
      icon: CheckSquare,
      description: "Single selection from options",
      example: "Pain level, Smoking status",
      defaultProps: {
        required: false,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      },
    },
    {
      id: "file",
      label: "File Upload",
      icon: Upload,
      description: "File attachment input",
      example: "Lab results, X-rays, Insurance cards",
      defaultProps: { required: false, accept: "image/*,.pdf,.doc,.docx" },
    },
    {
      id: "rating",
      label: "Rating Scale",
      icon: Star,
      description: "Star or numeric rating",
      example: "Pain scale (1-10), Satisfaction rating",
      defaultProps: { required: false, maxRating: 5, scale: "numeric" },
    },
  ];

  const addSection = () => {
    const newSection: Section = {
      id: `section-${Date.now()}`,
      name: `Section ${sections.length + 1}`,
      questions: [],
      expanded: true,
    };
    setSections([...sections, newSection]);
  };

  const deleteSection = (sectionId: string) => {
    if (sections.length > 1) setSections(sections.filter((s) => s.id !== sectionId));
  };

  const toggleSection = (sectionId: string) => {
    setSections(
      sections.map((section) =>
        section.id === sectionId ? { ...section, expanded: !section.expanded } : section
      )
    );
  };

  const updateSectionName = (sectionId: string, name: string) => {
    setSections(sections.map((section) => (section.id === sectionId ? { ...section, name } : section)));
  };

  const addQuestion = (sectionId: string, questionType: string) => {
    const questionTypeConfig = questionTypes.find((qt) => qt.id === questionType);
    if (!questionTypeConfig) {
      console.error("Invalid question type:", questionType);
      return;
    }
    const newQuestion: Question = {
      id: `q-${Date.now()}`,
      type: questionType,
      label: `New ${questionTypeConfig.label}`,
      ...questionTypeConfig.defaultProps,
      conditionalLogic: null,
      value: "",
    };
    setSections(
      sections.map((section) =>
        section.id === sectionId ? { ...section, questions: [...section.questions, newQuestion] } : section
      )
    );
  };

  const deleteQuestion = (sectionId: string, questionId: string) => {
    setSections(
      sections.map((section) =>
        section.id === sectionId
          ? { ...section, questions: section.questions.filter((q) => q.id !== questionId) }
          : section
      )
    );
  };

  const updateQuestion = (sectionId: string, questionId: string, updates: Partial<Question>) => {
    setSections(
      sections.map((section) =>
        section.id === sectionId
          ? { ...section, questions: section.questions.map((q) => (q.id === questionId ? { ...q, ...updates } : q)) }
          : section
      )
    );
  };

  const exportForm = () => {
    const formData = {
      title: formTitle,
      description: formDescription,
      sections: sections,
      createdAt: new Date().toISOString(),
    };
    
    const dataStr = JSON.stringify(formData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${formTitle.replace(/\s+/g, '_').toLowerCase()}_form.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const saveForm = async () => {
    const formData = {
      title: formTitle,
      description: formDescription,
      sections: sections,
      tags: [],
      category: "medical-assessment",
    };
  
    try {
      const response = await saveFormToDatabase(formData);
      alert("Form saved successfully!");
  
      
      const latestForm = await fetchLatestUserForm();
      if (latestForm) {
        setFormTitle(latestForm.title || "");
        setFormDescription(latestForm.description || "");
        setSections(latestForm.sections ?? []);
      }
    } catch (error) {
      console.error("Failed to save form:", error);
      alert("Failed to save form");
    }
  };
  
  const duplicateSection = (sectionId: string) => {
    const sectionToDuplicate = sections.find(s => s.id === sectionId);
    if (!sectionToDuplicate) return;
    
    const newSection: Section = {
      ...sectionToDuplicate,
      id: `section-${Date.now()}`,
      name: `${sectionToDuplicate.name} (Copy)`,
      questions: sectionToDuplicate.questions.map(q => ({
        ...q,
        id: `q-${Date.now()}-${Math.random()}`
      }))
    };
    
    const sectionIndex = sections.findIndex(s => s.id === sectionId);
    const newSections = [...sections];
    newSections.splice(sectionIndex + 1, 0, newSection);
    setSections(newSections);
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Stethoscope className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Physician Form Builder</h1>
                <p className="text-sm text-gray-600">Create custom medical forms with ease</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuestionTypeDrawerOpen(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                <Plus size={18} />
                Add Question
              </button>
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium transition-colors"
              >
                <Eye size={18} />
                {previewMode ? 'Edit' : 'Preview'}
              </button>
              <button
                onClick={saveForm}
                className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 font-medium transition-colors"
              >
                <Save size={18} />
                Save Form
              </button>
              <button
                onClick={exportForm}
                className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 font-medium transition-colors"
              >
                <FileText size={18} />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {previewMode ? (
          <FormPreview 
            sections={sections} 
            formTitle={formTitle} 
            formDescription={formDescription}
            formId="temp-form-id"
            userId="current-user-id"
          />
        ) : (
          <div className="space-y-8">
            
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <Settings className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Form Settings</h2>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block font-medium text-gray-700 mb-2">Form Title</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter form title"
                  />
                </div>
                
                <div>
                  <label className="block font-medium text-gray-700 mb-2">Form Description</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical"
                    rows={3}
                    placeholder="Enter form description"
                  />
                </div>
              </div>
            </div>

            
            <div className="space-y-6">
              {sections.map((section, sectionIndex) => (
                <div key={section.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                  
                  <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          onClick={() => toggleSection(section.id)}
                          className="text-gray-600 hover:text-gray-800 transition-colors"
                        >
                          {section.expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </button>
                        <Users className="w-5 h-5 text-blue-600" />
                        <input
                          type="text"
                          value={section.name}
                          onChange={(e) => updateSectionName(section.id, e.target.value)}
                          className="text-lg font-semibold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 flex-1"
                          placeholder="Section name"
                        />
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 bg-white px-2 py-1 rounded-full">
                          {section.questions.length} questions
                        </span>
                        <button
                          onClick={() => duplicateSection(section.id)}
                          className="text-gray-600 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition-colors"
                          title="Duplicate section"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={() => deleteSection(section.id)}
                          className="text-gray-600 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete section"
                          disabled={sections.length === 1}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  
                  {section.expanded && (
                    <div className="p-6">
                      {section.questions.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600 text-lg font-medium mb-2">No questions yet</p>
                          <p className="text-gray-500 mb-4">Add questions to this section to get started</p>
                          <button
                            onClick={() => setQuestionTypeDrawerOpen(true)}
                            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium transition-colors inline-flex items-center gap-2"
                          >
                            <Plus size={18} />
                            Add Your First Question
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {section.questions.map((question) => (
                            <QuestionEditor
                              key={question.id}
                              question={question}
                              sectionId={section.id}
                              onUpdate={(questionId, updates) => updateQuestion(section.id, questionId, updates)}
                              onDelete={(questionId) => deleteQuestion(section.id, questionId)}
                            />
                          ))}
                          
                          <div className="pt-4 border-t border-gray-200">
                            <button
                              onClick={() => setQuestionTypeDrawerOpen(true)}
                              className="w-full bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-700 border-2 border-dashed border-gray-300 hover:border-blue-300 px-4 py-6 rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                            >
                              <Plus size={18} />
                              Add Question to This Section
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              
              <div className="text-center">
                <button
                  onClick={addSection}
                  className="bg-white hover:bg-gray-50 text-gray-700 border-2 border-dashed border-gray-300 hover:border-blue-300 px-8 py-6 rounded-xl transition-colors font-medium inline-flex items-center gap-3 shadow-sm"
                >
                  <Plus size={20} />
                  Add New Section
                </button>
              </div>
            </div>

            
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Heart className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-semibold text-gray-900">Form Summary</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{sections.length}</div>
                  <div className="text-sm text-blue-800">Sections</div>
                </div>
                
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {sections.reduce((acc, section) => acc + section.questions.length, 0)}
                  </div>
                  <div className="text-sm text-green-800">Total Questions</div>
                </div>
                
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {sections.reduce((acc, section) => 
                      acc + section.questions.filter(q => q.required).length, 0
                    )}
                  </div>
                  <div className="text-sm text-purple-800">Required Fields</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      
      <QuestionTypesDrawer
        isOpen={questionTypeDrawerOpen}
        onClose={() => setQuestionTypeDrawerOpen(false)}
        questionTypes={questionTypes}
        onAddQuestion={addQuestion}
        sections={sections}
      />
    </div>
  );
};

export default PhysicianFormBuilder;