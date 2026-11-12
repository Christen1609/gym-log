#!/usr/bin/env ruby
# Adds the GymLogWidget app-extension target to ios/App/App.xcodeproj.
# Idempotent. Usage: ruby scripts/add-widget-target.rb [path/to/App.xcodeproj]
require 'xcodeproj'

proj_path = ARGV[0] || File.expand_path('../ios/App/App.xcodeproj', __dir__)
NAME = 'GymLogWidget'
BUNDLE_ID = 'com.christen1609.gymlog.widget'
# accessoryRectangular widgets need iOS 16+ (the App target stays on its own, lower target).
DEPLOYMENT = '16.0'

project = Xcodeproj::Project.open(proj_path)

if project.targets.any? { |t| t.name == NAME }
  puts "#{NAME} target already exists - nothing to do."
  exit 0
end

app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')
app_cfg = app.build_configurations.find { |c| c.name == 'Release' } || app.build_configurations.first

# Widget folder is ios/GymLogWidget, a sibling of ios/App (the project's dir).
widget_dir = File.expand_path('../GymLogWidget', File.dirname(proj_path))
abort("#{widget_dir} not found") unless Dir.exist?(widget_dir)
sources = Dir.glob(File.join(widget_dir, '*.swift')).sort
abort('no Swift sources in GymLogWidget') if sources.empty?

target = project.new_target(:app_extension, NAME, :ios, DEPLOYMENT, nil, :swift)

group = project.main_group.new_group(NAME, '../GymLogWidget')
refs = sources.map { |s| group.new_file(File.basename(s)) }
target.add_file_references(refs)
group.new_file('Info.plist')
group.new_file("#{NAME}.entitlements")

target.add_system_framework(%w[WidgetKit SwiftUI])

target.build_configurations.each do |c|
  s = c.build_settings
  s['INFOPLIST_FILE'] = '../GymLogWidget/Info.plist' # relative to SRCROOT (ios/App)
  s['CODE_SIGN_ENTITLEMENTS'] = "../GymLogWidget/#{NAME}.entitlements"
  s['PRODUCT_BUNDLE_IDENTIFIER'] = BUNDLE_ID
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT
  s['SKIP_INSTALL'] = 'YES'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  %w[MARKETING_VERSION CURRENT_PROJECT_VERSION DEVELOPMENT_TEAM].each do |k|
    v = (app.build_configurations.find { |a| a.name == c.name } || app_cfg).build_settings[k]
    s[k] = v if v
  end
end

# Embed into the app (PlugIns, dstSubfolderSpec 13) + dependency.
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
        app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(target.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
app.add_dependency(target)

project.save
puts "Added #{NAME} target (deployment #{DEPLOYMENT})."
